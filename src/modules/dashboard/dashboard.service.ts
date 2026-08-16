import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  Prisma,
  PaymentStatus,
  OrderStatus,
  TableStatus,
  PaymentMethod,
} from 'generated/prisma/client';
import {
  DashboardPeriod,
  TrendGroupBy,
  DashboardQueryDto,
} from './dto/dashboard-query.dto';
import { SalesTrendQueryDto } from './dto/sales-trend-query.dto';
import { TopItemsQueryDto, TopItemsSort } from './dto/top-items-query.dto';
import { RecentOrdersQueryDto } from './dto/recent-orders-query.dto';

/** Comparison direction reported by KPI cards. */
type ComparisonDirection = 'UP' | 'DOWN' | 'UNCHANGED';

/** An inclusive lower / exclusive upper date range (server-local time). */
interface Range {
  start: Date;
  end: Date;
}

/** A single bucket of a grouped sales trend / revenue-vs-orders chart. */
export interface TrendPoint {
  label: string;
  date: string;
  revenue: number;
  orders: number;
}

/** Raw per-bucket revenue row returned by the database. */
interface RevenueBucket {
  label: string;
  date: string;
  revenue: number;
}

/** Inventory record augmented with a computed health status. */
export interface InventoryLevelItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
  status: 'HEALTHY' | 'LOW' | 'CRITICAL';
}

/**
 * Dashboard analytics service.
 *
 * ## Revenue source of truth
 * Realized revenue is derived exclusively from `Billing` records whose
 * `paymentStatus` is `PAID` (the established billing lifecycle — `payBill`
 * transitions a bill to `PAID` and stamps `paidAt`). Cancelled/refunded or
 * unpaid bills are never counted as realized revenue. The billing date used for
 * period bucketing is `paidAt`, falling back to `createdAt` for records created
 * before `paidAt` was populated.
 *
 * ## Time charge source of truth
 * `Billing.timeChargeAmount` is authoritative. It is the final value computed
 * once at `generateBill` time and stored on the record; summing it avoids double
 * counting with `TableSession.timeChargeAmount` or `Order.timeChargeAmount`.
 *
 * ## Period / time-zone convention
 * The project has no explicit time-zone configuration and day boundaries are
 * built with the server's local time (matching `generateBillNumber`). Periods
 * use equal-length rolling windows (`today`, `week` = 7d, `month` = 30d,
 * `year` = 365d) ending "now" for period presets, and an explicit
 * `[startDate, endDate)` for custom ranges. Previous-period comparisons shift
 * the same window backwards.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Resolves the current and the previous (equal-length) reporting ranges.
   * An explicit `startDate` wins over the `period` preset.
   */
  private resolveRange(
    period?: DashboardPeriod,
    startDate?: Date,
    endDate?: Date,
  ): { range: Range; previous: Range } {
    const now = new Date();
    let start: Date;
    let end: Date;
    let durationMs: number;

    if (startDate) {
      start = new Date(startDate.getTime());
      end = endDate ? new Date(endDate.getTime()) : new Date(now.getTime());
      if (end < start) {
        end = new Date(start.getTime());
      }
      durationMs = Math.max(end.getTime() - start.getTime(), 0);
    } else {
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const preset = period ?? DashboardPeriod.TODAY;
      const days =
        preset === DashboardPeriod.TODAY
          ? 0
          : preset === DashboardPeriod.WEEK
            ? 6
            : preset === DashboardPeriod.MONTH
              ? 29
              : 364;
      start = new Date(startOfToday.getTime() - days * this.DAY_MS);
      end = new Date(now.getTime());
      durationMs = end.getTime() - start.getTime();
    }

    const previous: Range = {
      start: new Date(start.getTime() - durationMs),
      end: new Date(start.getTime()),
    };

    return { range: { start, end }, previous };
  }

  /** Rounds to a fixed number of decimal places. */
  private round(value: number, dp: number): number {
    const factor = Math.pow(10, dp);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  /** Coerces a Prisma `Decimal`/number/string/BigInt (or null/undefined) to a number. */
  private money(
    value: Prisma.Decimal | number | string | bigint | null | undefined,
  ): number {
    const n = value == null || value === '' ? 0 : Number(value);
    return this.round(Number.isFinite(n) ? n : 0, 2);
  }

  /**
   * Computes the KPI comparison percentage and direction.
   * A zero previous value yields `null` percentage (never `Infinity`) with an
   * `UNCHANGED` direction, per project conventions.
   */
  private comparison(
    current: number,
    previous: number,
  ): {
    comparisonPercentage: number | null;
    comparisonDirection: ComparisonDirection;
  } {
    if (previous === 0) {
      return { comparisonPercentage: null, comparisonDirection: 'UNCHANGED' };
    }
    const percentage = ((current - previous) / previous) * 100;
    const direction: ComparisonDirection =
      current > previous ? 'UP' : current < previous ? 'DOWN' : 'UNCHANGED';
    return {
      comparisonPercentage: this.round(percentage, 1),
      comparisonDirection: direction,
    };
  }

  // #region Aggregation helpers

  /** Filters for realized (paid) bills attributed to the given range. */
  private billPaymentWhere(range: Range): Prisma.BillingWhereInput {
    return {
      paymentStatus: PaymentStatus.PAID,
      OR: [
        { paidAt: { gte: range.start, lt: range.end } },
        { paidAt: null, createdAt: { gte: range.start, lt: range.end } },
      ],
    };
  }

  /** Realized revenue and the number of valid (paid) bills in the range. */
  private async revenueAndBillCount(
    range: Range,
  ): Promise<{ revenue: number; billCount: number }> {
    const agg = await this.prisma.billing.aggregate({
      where: this.billPaymentWhere(range),
      _sum: { totalAmount: true },
      _count: true,
    });
    return { revenue: this.money(agg._sum.totalAmount), billCount: agg._count };
  }

  /** Valid order count for the range (non-deleted, non-cancelled). */
  private async ordersCount(range: Range): Promise<number> {
    return this.prisma.order.count({
      where: {
        createdAt: { gte: range.start, lt: range.end },
        deletedAt: null,
        status: { not: OrderStatus.CANCELLED },
      },
    });
  }

  /** Total quantity sold from valid, non-cancelled order items in the range. */
  private async itemsSoldQuantity(range: Range): Promise<number> {
    const agg = await this.prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        isCancelled: false,
        deletedAt: null,
        order: {
          is: {
            createdAt: { gte: range.start, lt: range.end },
            deletedAt: null,
            status: { not: OrderStatus.CANCELLED },
          },
        },
      },
    });
    return agg._sum.quantity ?? 0;
  }

  /** Total time charges from realized (paid) bills in the range. */
  private async timeCharges(range: Range): Promise<number> {
    const agg = await this.prisma.billing.aggregate({
      _sum: { timeChargeAmount: true },
      where: {
        ...this.billPaymentWhere(range),
        timeChargeAmount: { not: null },
      },
    });
    return this.money(agg._sum.timeChargeAmount);
  }

  /** Occupied vs total tables and occupancy percentage. */
  private async activeTables(): Promise<{
    active: number;
    total: number;
    occupancyPercentage: number;
  }> {
    const [active, total] = await Promise.all([
      this.prisma.restaurantTable.count({
        where: { deletedAt: null, tableStatus: TableStatus.OCCUPIED },
      }),
      this.prisma.restaurantTable.count({ where: { deletedAt: null } }),
    ]);
    const occupancyPercentage =
      total > 0 ? this.round((active / total) * 100, 2) : 0;
    return { active, total, occupancyPercentage };
  }

  /**
   * Outstanding monetary amount and bill count.
   *
   * Calculated from `UNPAID` + `PARTIAL` bills (current state, no date filter —
   * it reflects what is owed right now). **Documented limitation:** a `PARTIAL`
   * bill is counted at full `totalAmount` because the schema does not reliably
   * store how much has been paid (only `CASH_ONLINE` splits are persisted), and
   * existing business logic never sets `PARTIAL`.
   */
  private async outstanding(): Promise<{ amount: number; billCount: number }> {
    const grouped = await this.prisma.billing.groupBy({
      by: ['paymentStatus'],
      where: {
        paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
      },
      _count: true,
      _sum: { totalAmount: true },
    });

    let amount = 0;
    let billCount = 0;
    for (const g of grouped) {
      amount += this.money(g._sum.totalAmount);
      billCount += g._count;
    }
    return { amount: this.round(amount, 2), billCount };
  }

  /** Active, non-deleted inventory items at or below their low-stock threshold. */
  private async lowStockCount(): Promise<number> {
    return this.prisma.inventoryItem.count({
      where: {
        deletedAt: null,
        isActive: true,
        quantity: { lte: this.prisma.inventoryItem.fields.lowStockThreshold },
      },
    });
  }

  // #region Public KPI methods

  /** Today's / period revenue with previous-period comparison. */
  async getRevenue(
    query: DashboardQueryDto,
  ): Promise<{ amount: number } & ReturnType<DashboardService['comparison']>> {
    const { range, previous } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const [current, prior] = await Promise.all([
      this.revenueAndBillCount(range),
      this.revenueAndBillCount(previous),
    ]);
    return {
      amount: current.revenue,
      ...this.comparison(current.revenue, prior.revenue),
    };
  }

  /** Valid order count with previous-period comparison. */
  async getOrders(
    query: DashboardQueryDto,
  ): Promise<{ count: number } & ReturnType<DashboardService['comparison']>> {
    const { range, previous } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const [current, prior] = await Promise.all([
      this.ordersCount(range),
      this.ordersCount(previous),
    ]);
    return { count: current, ...this.comparison(current, prior) };
  }

  /** Items sold with previous-period comparison. */
  async getItemsSold(
    query: DashboardQueryDto,
  ): Promise<
    { quantity: number } & ReturnType<DashboardService['comparison']>
  > {
    const { range, previous } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const [current, prior] = await Promise.all([
      this.itemsSoldQuantity(range),
      this.itemsSoldQuantity(previous),
    ]);
    return { quantity: current, ...this.comparison(current, prior) };
  }

  /** Time charges with previous-period comparison. */
  async getTimeCharges(
    query: DashboardQueryDto,
  ): Promise<{ amount: number } & ReturnType<DashboardService['comparison']>> {
    const { range, previous } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const [current, prior] = await Promise.all([
      this.timeCharges(range),
      this.timeCharges(previous),
    ]);
    return { amount: current, ...this.comparison(current, prior) };
  }

  /** Active tables with occupancy. */
  async getActiveTables(): Promise<{
    active: number;
    total: number;
    occupancyPercentage: number;
  }> {
    return this.activeTables();
  }

  /** Outstanding amount and bill count. */
  async getOutstanding(): Promise<{ amount: number; billCount: number }> {
    return this.outstanding();
  }

  /** Average realized bill value = revenue / valid paid bill count. */
  async getAvgBill(
    query: DashboardQueryDto,
  ): Promise<
    { averageAmount: number; billCount: number } & ReturnType<
      DashboardService['comparison']
    >
  > {
    const { range, previous } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const [current, prior] = await Promise.all([
      this.revenueAndBillCount(range),
      this.revenueAndBillCount(previous),
    ]);
    const currentAvg =
      current.billCount > 0
        ? this.round(current.revenue / current.billCount, 2)
        : 0;
    const previousAvg =
      prior.billCount > 0 ? this.round(prior.revenue / prior.billCount, 2) : 0;
    return {
      averageAmount: currentAvg,
      billCount: current.billCount,
      ...this.comparison(currentAvg, previousAvg),
    };
  }

  /** Active low-stock inventory count. */
  async getLowStockCount(): Promise<{ count: number }> {
    return { count: await this.lowStockCount() };
  }

  // #region Trend (Sales trend / revenue-vs-orders)

  /** Effective billed date expression used for period bucketing in SQL. */
  private effectiveDateSql(kind: 'billing' | 'order'): Prisma.Sql {
    return kind === 'billing'
      ? Prisma.raw('COALESCE(b.paidAt, b.createdAt)')
      : Prisma.raw('o.createdAt');
  }

  /**
   * Builds the `GROUP BY` / label / date expressions for the given bucket.
   * Both revenue and orders are grouped with the exact same key so the results
   * can be merged. `groupBy` comes from a strict enum, so no client-controlled
   * SQL is ever interpolated.
   */
  private buildTimeGrouping(
    groupBy: TrendGroupBy,
    col: Prisma.Sql,
  ): { group: Prisma.Sql; date: Prisma.Sql; label: Prisma.Sql } {
    switch (groupBy) {
      case TrendGroupBy.HOUR:
        return {
          group: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m-%d %H:00:00')`,
          date: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m-%d')`,
          label: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m-%d %H:00')`,
        };
      case TrendGroupBy.WEEK:
        return {
          group: Prisma.sql`YEARWEEK(${col}, 1)`,
          date: Prisma.sql`DATE_FORMAT(DATE_SUB(DATE(${col}), INTERVAL WEEKDAY(${col}) DAY), '%Y-%m-%d')`,
          label: Prisma.sql`DATE_FORMAT(DATE_SUB(DATE(${col}), INTERVAL WEEKDAY(${col}) DAY), '%Y-%m-%d')`,
        };
      case TrendGroupBy.MONTH:
        return {
          group: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m')`,
          date: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m-01')`,
          label: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m')`,
        };
      case TrendGroupBy.DAY:
      default:
        return {
          group: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m-%d')`,
          date: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m-%d')`,
          label: Prisma.sql`DATE_FORMAT(${col}, '%Y-%m-%d')`,
        };
    }
  }

  /** Per-bucket realized revenue via a single grouped SQL query. */
  private async fetchRevenueBuckets(
    range: Range,
    groupBy: TrendGroupBy,
  ): Promise<Map<string, RevenueBucket>> {
    const col = this.effectiveDateSql('billing');
    const g = this.buildTimeGrouping(groupBy, col);

    const rows = await this.prisma.$queryRaw<
      Array<{
        label: string;
        date: string | null;
        revenue: number | string | null;
      }>
    >`
      SELECT
        MIN(${g.label}) AS label,
        MIN(${g.date}) AS date,
        COALESCE(SUM(b.totalAmount), 0) AS revenue
      FROM Billing b
      WHERE b.paymentStatus = ${PaymentStatus.PAID}
        AND COALESCE(b.paidAt, b.createdAt) >= ${range.start}
        AND COALESCE(b.paidAt, b.createdAt) < ${range.end}
      GROUP BY ${g.group}
      ORDER BY ${g.group}
    `;

    const buckets = new Map<string, RevenueBucket>();
    for (const row of rows) {
      const key = String(row.label ?? '');
      buckets.set(key, {
        label: key,
        date: row.date ? String(row.date) : key,
        revenue: this.money(row.revenue),
      });
    }
    return buckets;
  }

  /** Per-bucket valid order count via a single grouped SQL query. */
  private async fetchOrderBuckets(
    range: Range,
    groupBy: TrendGroupBy,
  ): Promise<Map<string, number>> {
    const col = this.effectiveDateSql('order');
    const g = this.buildTimeGrouping(groupBy, col);

    const rows = await this.prisma.$queryRaw<
      Array<{ label: string; orders: number | bigint | string }>
    >`
      SELECT
        MIN(${g.label}) AS label,
        COUNT(*) AS orders
      FROM \`Order\` o
      WHERE o.deletedAt IS NULL
        AND o.status <> ${OrderStatus.CANCELLED}
        AND o.createdAt >= ${range.start}
        AND o.createdAt < ${range.end}
      GROUP BY ${g.group}
      ORDER BY ${g.group}
    `;

    const buckets = new Map<string, number>();
    for (const row of rows) {
      buckets.set(String(row.label ?? ''), Number(row.orders ?? 0));
    }
    return buckets;
  }

  /** Merges revenue and order buckets into an ordered trend series. */
  private async buildTrend(
    range: Range,
    groupBy: TrendGroupBy,
  ): Promise<TrendPoint[]> {
    const [revenueBuckets, orderBuckets] = await Promise.all([
      this.fetchRevenueBuckets(range, groupBy),
      this.fetchOrderBuckets(range, groupBy),
    ]);

    const keys = new Set<string>([
      ...revenueBuckets.keys(),
      ...orderBuckets.keys(),
    ]);
    const points: TrendPoint[] = [];
    for (const key of keys) {
      const rev = revenueBuckets.get(key);
      points.push({
        label: rev?.label ?? key,
        date: rev?.date ?? key,
        revenue: rev?.revenue ?? 0,
        orders: orderBuckets.get(key) ?? 0,
      });
    }
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return points;
  }

  /** Sales trend for the requested range and time bucket. */
  async getSalesTrend(query: SalesTrendQueryDto): Promise<TrendPoint[]> {
    const { range } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    return this.buildTrend(range, query.groupBy ?? TrendGroupBy.DAY);
  }

  /** Revenue-vs-orders chart (same series, default weekly bucketing). */
  async getRevenueVsOrders(query: SalesTrendQueryDto): Promise<TrendPoint[]> {
    const { range } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    return this.buildTrend(range, query.groupBy ?? TrendGroupBy.WEEK);
  }

  /** Current order-status distribution grouped by live `Order.status`. */
  async getOrderStatusDistribution(
    query: DashboardQueryDto,
  ): Promise<Record<string, number>> {
    const { range } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: range.start, lt: range.end },
        deletedAt: null,
      },
      _count: true,
    });

    const keyMap: Record<string, string> = {
      PENDING: 'pending',
      ACCEPTED: 'accepted',
      PREPARING: 'preparing',
      READY: 'ready',
      SERVED: 'served',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    };
    const counts: Record<string, number> = {
      pending: 0,
      accepted: 0,
      preparing: 0,
      ready: 0,
      served: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const g of grouped) {
      const key = keyMap[g.status];
      if (key) {
        counts[key] = g._count;
      }
    }
    return counts;
  }

  // #region Inventory analytics

  /**
   * Computes an inventory health status from quantity vs low-stock threshold.
   * - `CRITICAL`: out of stock (quantity <= 0) or at/below half the threshold.
   * - `LOW`:      at/below the threshold.
   * - `HEALTHY`:  above the threshold.
   */
  private inventoryStatus(item: {
    quantity: Prisma.Decimal | number | string;
    lowStockThreshold: Prisma.Decimal | number | string;
  }): {
    quantity: number;
    lowStockThreshold: number;
    status: 'HEALTHY' | 'LOW' | 'CRITICAL';
  } {
    const quantity = this.money(item.quantity);
    const lowStockThreshold = this.money(item.lowStockThreshold);
    let status: 'HEALTHY' | 'LOW' | 'CRITICAL';
    if (
      quantity <= 0 ||
      (lowStockThreshold > 0 && quantity <= lowStockThreshold / 2)
    ) {
      status = 'CRITICAL';
    } else if (quantity <= lowStockThreshold) {
      status = 'LOW';
    } else {
      status = 'HEALTHY';
    }
    return { quantity, lowStockThreshold, status };
  }

  /** Inventory levels with health status for all active, non-deleted items. */
  async getInventoryOverview(): Promise<InventoryLevelItem[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        quantity: true,
        lowStockThreshold: true,
      },
      orderBy: { name: 'asc' },
    });
    return items.map((it) => {
      const health = this.inventoryStatus(it);
      return {
        id: it.id,
        name: it.name,
        quantity: health.quantity,
        unit: it.unit,
        lowStockThreshold: health.lowStockThreshold,
        status: health.status,
      };
    });
  }

  /** Low-stock alerts, most critical (lowest quantity) first. */
  async getLowStockAlerts(): Promise<
    Array<{
      name: string;
      quantity: number;
      unit: string;
      lowStockThreshold: number;
      severity: 'HEALTHY' | 'LOW' | 'CRITICAL';
    }>
  > {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        quantity: { lte: this.prisma.inventoryItem.fields.lowStockThreshold },
      },
      select: {
        name: true,
        unit: true,
        quantity: true,
        lowStockThreshold: true,
      },
      orderBy: { quantity: 'asc' },
    });
    return items.map((it) => {
      const health = this.inventoryStatus(it);
      return {
        name: it.name,
        quantity: health.quantity,
        unit: it.unit,
        lowStockThreshold: health.lowStockThreshold,
        severity: health.status,
      };
    });
  }

  // #endregion

  // #region Top selling + payment methods

  /** Best-selling items grouped by menu item, sorted and limited in SQL. */
  async getTopItems(query: TopItemsQueryDto): Promise<
    Array<{
      menuItemId: number | null;
      name: string;
      category: string;
      quantitySold: number;
      revenue: number;
    }>
  > {
    const { range } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const sort = query.sort ?? TopItemsSort.QUANTITY;
    const orderBy = Prisma.raw(
      sort === TopItemsSort.REVENUE ? 'revenue' : 'quantity',
    );
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 100);

    const rows = await this.prisma.$queryRaw<
      Array<{
        menuItemId: number | bigint | null;
        name: string;
        category: string;
        quantity: number | string | bigint | null;
        revenue: number | string | bigint | null;
      }>
    >`
      SELECT
        oi.menuItemId AS menuItemId,
        COALESCE(m.name, '') AS name,
        COALESCE(c.name, '') AS category,
        COALESCE(SUM(oi.quantity), 0) AS quantity,
        COALESCE(SUM(oi.totalPrice), 0) AS revenue
      FROM OrderItem oi
      JOIN \`Order\` o ON o.id = oi.orderId
      LEFT JOIN MenuItem m ON m.id = oi.menuItemId
      LEFT JOIN Category c ON c.id = m.categoryId
      WHERE oi.menuItemId IS NOT NULL
        AND oi.isCancelled = 0
        AND oi.deletedAt IS NULL
        AND o.deletedAt IS NULL
        AND o.status <> ${OrderStatus.CANCELLED}
        AND o.createdAt >= ${range.start}
        AND o.createdAt < ${range.end}
      GROUP BY oi.menuItemId, m.name, c.name
      ORDER BY ${orderBy} DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      menuItemId: row.menuItemId === null ? null : Number(row.menuItemId),
      name: row.name,
      category: row.category,
      quantitySold: Number(row.quantity ?? 0),
      revenue: this.money(row.revenue),
    }));
  }

  /** Realized payment-method breakdown with counts, amounts and share. */
  async getPaymentMethods(query: DashboardQueryDto): Promise<
    Array<{
      method: PaymentMethod;
      count: number;
      amount: number;
      percentage: number;
    }>
  > {
    const { range } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const grouped = await this.prisma.billing.groupBy({
      by: ['paymentMethod'],
      where: this.billPaymentWhere(range),
      _count: true,
      _sum: { totalAmount: true },
    });

    const valid = grouped.filter(
      (g): g is typeof g & { paymentMethod: PaymentMethod } =>
        g.paymentMethod !== null,
    );

    let total = 0;
    for (const g of valid) {
      total += this.money(g._sum.totalAmount);
    }

    const data = valid.map((g) => {
      const amount = this.money(g._sum.totalAmount);
      return {
        method: g.paymentMethod,
        count: g._count,
        amount,
        percentage: total > 0 ? this.round((amount / total) * 100, 1) : 0,
      };
    });
    data.sort((a, b) => b.amount - a.amount);
    return data;
  }

  /** Latest valid orders in the range with details for the dashboard table. */
  async getRecentOrders(query: RecentOrdersQueryDto): Promise<{
    items: Array<{
      orderNumber: string;
      customer: null;
      table: string | null;
      itemCount: number;
      totalAmount: number;
      paymentStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'REFUNDED';
      paymentMethod: PaymentMethod | null;
      status:
        | 'PENDING'
        | 'ACCEPTED'
        | 'PREPARING'
        | 'READY'
        | 'SERVED'
        | 'COMPLETED'
        | 'CANCELLED';
      createdAt: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { range } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: range.start, lt: range.end },
      deletedAt: null,
    };

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          table: { select: { name: true } },
          items: { where: { isCancelled: false }, select: { quantity: true } },
          billings: {
            select: {
              totalAmount: true,
              paymentStatus: true,
              paymentMethod: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const items = orders.map((o) => {
      const billing =
        o.billings && o.billings.length > 0 ? o.billings[0] : null;
      return {
        orderNumber: o.orderNumber,
        customer: null,
        table: o.table?.name ?? null,
        itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
        totalAmount: this.money(billing ? billing.totalAmount : o.totalAmount),
        paymentStatus: billing ? billing.paymentStatus : o.paymentStatus,
        paymentMethod: billing?.paymentMethod ?? null,
        status: o.status,
        createdAt: o.createdAt,
      };
    });

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Consolidated data for the top KPI cards. */
  async getSummary(query: DashboardQueryDto): Promise<{
    revenue: Awaited<ReturnType<DashboardService['getRevenue']>>;
    orders: Awaited<ReturnType<DashboardService['getOrders']>>;
    activeTables: {
      active: number;
      total: number;
      occupancyPercentage: number;
    };
    itemsSold: Awaited<ReturnType<DashboardService['getItemsSold']>>;
    timeCharges: Awaited<ReturnType<DashboardService['getTimeCharges']>>;
    outstanding: { amount: number; billCount: number };
    avgBill: Awaited<ReturnType<DashboardService['getAvgBill']>>;
    lowStock: { count: number };
  }> {
    const { range, previous } = this.resolveRange(
      query.period,
      query.startDate,
      query.endDate,
    );

    const [
      revCurrent,
      revPrevious,
      ordersCurrent,
      ordersPrevious,
      itemsCurrent,
      itemsPrevious,
      timeCurrent,
      timePrevious,
      tables,
      outstandingAmount,
      lowStockValue,
    ] = await Promise.all([
      this.revenueAndBillCount(range),
      this.revenueAndBillCount(previous),
      this.ordersCount(range),
      this.ordersCount(previous),
      this.itemsSoldQuantity(range),
      this.itemsSoldQuantity(previous),
      this.timeCharges(range),
      this.timeCharges(previous),
      this.activeTables(),
      this.outstanding(),
      this.lowStockCount(),
    ]);

    const currentAvg =
      revCurrent.billCount > 0
        ? this.round(revCurrent.revenue / revCurrent.billCount, 2)
        : 0;
    const previousAvg =
      revPrevious.billCount > 0
        ? this.round(revPrevious.revenue / revPrevious.billCount, 2)
        : 0;

    return {
      revenue: {
        amount: revCurrent.revenue,
        ...this.comparison(revCurrent.revenue, revPrevious.revenue),
      },
      orders: {
        count: ordersCurrent,
        ...this.comparison(ordersCurrent, ordersPrevious),
      },
      activeTables: tables,
      itemsSold: {
        quantity: itemsCurrent,
        ...this.comparison(itemsCurrent, itemsPrevious),
      },
      timeCharges: {
        amount: timeCurrent,
        ...this.comparison(timeCurrent, timePrevious),
      },
      outstanding: outstandingAmount,
      avgBill: {
        averageAmount: currentAvg,
        billCount: revCurrent.billCount,
        ...this.comparison(currentAvg, previousAvg),
      },
      lowStock: { count: lowStockValue },
    };
  }
}
