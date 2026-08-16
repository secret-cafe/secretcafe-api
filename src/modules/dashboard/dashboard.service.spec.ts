import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DashboardPeriod, TrendGroupBy } from './dto/dashboard-query.dto';
import { TopItemsSort } from './dto/top-items-query.dto';

/** Returns the first argument of the first call of a jest mock (type-safe). */
function callFirstArg<T>(mock: jest.Mock): T {
  return (mock as unknown as { mock: { calls: Array<[T]> } }).mock.calls[0][0];
}

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    billing: { aggregate: jest.Mock; groupBy: jest.Mock };
    order: { count: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    orderItem: { aggregate: jest.Mock };
    restaurantTable: { count: jest.Mock };
    inventoryItem: {
      fields: { lowStockThreshold: string };
      count: jest.Mock;
      findMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      billing: { aggregate: jest.fn(), groupBy: jest.fn() },
      order: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      orderItem: { aggregate: jest.fn() },
      restaurantTable: { count: jest.fn() },
      inventoryItem: {
        fields: { lowStockThreshold: 'lowStockThreshold' },
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSummary', () => {
    beforeEach(() => {
      // billing.aggregate: revenue (range + previous) + time charges (range + previous)
      prisma.billing.aggregate.mockResolvedValue({
        _sum: { totalAmount: 100, timeChargeAmount: 10 },
        _count: 10,
      });
      prisma.order.count.mockResolvedValue(50);
      prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 20 } });
      prisma.restaurantTable.count
        .mockResolvedValueOnce(14)
        .mockResolvedValueOnce(24);
      prisma.inventoryItem.count.mockResolvedValue(3);
      prisma.billing.groupBy.mockResolvedValue([
        { paymentStatus: 'UNPAID', _count: 5, _sum: { totalAmount: 2140 } },
        { paymentStatus: 'PARTIAL', _count: 1, _sum: { totalAmount: 100 } },
      ]);
    });

    it('aggregates all KPI cards into one payload', async () => {
      const result = await service.getSummary({});

      expect(result.revenue.amount).toBe(100);
      expect(result.orders.count).toBe(50);
      expect(result.itemsSold.quantity).toBe(20);
      expect(result.timeCharges.amount).toBe(10);
      expect(result.avgBill.averageAmount).toBe(10);
      expect(result.avgBill.billCount).toBe(10);
      expect(result.activeTables).toEqual({
        active: 14,
        total: 24,
        occupancyPercentage: 58.33,
      });
      expect(result.outstanding).toEqual({ amount: 2240, billCount: 6 });
      expect(result.lowStock.count).toBe(3);
      // Equal current/previous => 0% change, UNCHANGED direction
      expect(result.revenue.comparisonPercentage).toBe(0);
      expect(result.revenue.comparisonDirection).toBe('UNCHANGED');
    });
  });

  describe('KPI edge cases', () => {
    describe('getRevenue', () => {
      it('returns null percentage and UNCHANGED when previous period is zero', async () => {
        prisma.billing.aggregate
          .mockResolvedValueOnce({ _sum: { totalAmount: 100 }, _count: 1 })
          .mockResolvedValueOnce({ _sum: { totalAmount: 0 }, _count: 0 });

        const result = await service.getRevenue({});
        expect(result.amount).toBe(100);
        expect(result.comparisonPercentage).toBeNull();
        expect(result.comparisonDirection).toBe('UNCHANGED');
      });

      it('computes UP percentage against a non-zero previous period', async () => {
        prisma.billing.aggregate
          .mockResolvedValueOnce({ _sum: { totalAmount: 48920 }, _count: 101 })
          .mockResolvedValueOnce({ _sum: { totalAmount: 43520 }, _count: 90 });

        const result = await service.getRevenue({
          period: DashboardPeriod.WEEK,
        });
        expect(result.comparisonPercentage).toBe(12.4);
        expect(result.comparisonDirection).toBe('UP');
      });
    });

    describe('getActiveTables', () => {
      it('computes occupancy percentage', async () => {
        prisma.restaurantTable.count
          .mockResolvedValueOnce(14)
          .mockResolvedValueOnce(24);
        const result = await service.getActiveTables();
        expect(result).toEqual({
          active: 14,
          total: 24,
          occupancyPercentage: 58.33,
        });
      });
    });

    describe('getOutstanding', () => {
      it('sums UNPAID and PARTIAL bills and their counts', async () => {
        prisma.billing.groupBy.mockResolvedValue([
          { paymentStatus: 'UNPAID', _count: 3, _sum: { totalAmount: 3000 } },
          { paymentStatus: 'PARTIAL', _count: 2, _sum: { totalAmount: 500 } },
        ]);
        const result = await service.getOutstanding();
        expect(result.amount).toBe(3500);
        expect(result.billCount).toBe(5);
      });
    });

    describe('getLowStockCount', () => {
      it('counts only active, non-deleted low-stock items', async () => {
        prisma.inventoryItem.count.mockResolvedValue(3);
        const result = await service.getLowStockCount();
        expect(result.count).toBe(3);
        const args = callFirstArg<{
          where?: {
            deletedAt?: unknown;
            isActive?: unknown;
            quantity?: { lte?: unknown };
          };
        }>(prisma.inventoryItem.count);
        expect(args.where?.deletedAt).toBeNull();
        expect(args.where?.isActive).toBe(true);
        expect(args.where?.quantity).toEqual({ lte: 'lowStockThreshold' });
      });
    });

    describe('getAvgBill', () => {
      it('uses bill count (not order count) for the average', async () => {
        prisma.billing.aggregate
          .mockResolvedValueOnce({ _sum: { totalAmount: 49086 }, _count: 101 })
          .mockResolvedValueOnce({ _sum: { totalAmount: 600 }, _count: 2 });

        const result = await service.getAvgBill({});
        expect(result.averageAmount).toBe(486);
        expect(result.billCount).toBe(101);
      });
    });

    describe('soft-delete and cancellation filtering', () => {
      it('excludes cancelled and soft-deleted orders from the order count', async () => {
        prisma.order.count.mockResolvedValue(10);
        await service.getOrders({});
        const args = callFirstArg<{
          where?: { deletedAt?: unknown; status?: { not?: unknown } };
        }>(prisma.order.count);
        expect(args.where?.deletedAt).toBeNull();
        expect(args.where?.status).toEqual({ not: 'CANCELLED' });
      });

      it('excludes cancelled/deleted items and invalid orders from items sold', async () => {
        prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });
        await service.getItemsSold({});
        const args = callFirstArg<{
          where?: {
            isCancelled?: unknown;
            deletedAt?: unknown;
            order?: {
              is?: { deletedAt?: unknown; status?: { not?: unknown } };
            };
          };
        }>(prisma.orderItem.aggregate);
        expect(args.where?.isCancelled).toBe(false);
        expect(args.where?.deletedAt).toBeNull();
        expect(args.where?.order?.is?.deletedAt).toBeNull();
        expect(args.where?.order?.is?.status).toEqual({ not: 'CANCELLED' });
      });
    });
  });

  describe('Analytics', () => {
    describe('getSalesTrend', () => {
      it('merges revenue and order buckets keyed by label', async () => {
        prisma.$queryRaw
          .mockResolvedValueOnce([
            { label: '2026-08-10', date: '2026-08-10', revenue: 38000 },
          ])
          .mockResolvedValueOnce([{ label: '2026-08-10', orders: 124 }]);

        const result = await service.getSalesTrend({
          groupBy: TrendGroupBy.DAY,
        });
        expect(result).toEqual([
          {
            label: '2026-08-10',
            date: '2026-08-10',
            revenue: 38000,
            orders: 124,
          },
        ]);
      });

      it('returns an empty series when no data exists', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        const result = await service.getSalesTrend({});
        expect(result).toEqual([]);
      });
    });

    describe('getRevenueVsOrders', () => {
      it('defaults to weekly bucketing and merges revenue + orders', async () => {
        prisma.$queryRaw
          .mockResolvedValueOnce([
            { label: '2026-08-10', date: '2026-08-10', revenue: 40000 },
          ])
          .mockResolvedValueOnce([{ label: '2026-08-10', orders: 100 }]);

        const result = await service.getRevenueVsOrders({});
        expect(result).toEqual([
          {
            label: '2026-08-10',
            date: '2026-08-10',
            revenue: 40000,
            orders: 100,
          },
        ]);
      });
    });

    describe('getOrderStatusDistribution', () => {
      it('counts by live order status and zero-fills missing statuses', async () => {
        prisma.order.groupBy.mockResolvedValue([
          { status: 'COMPLETED', _count: 120 },
          { status: 'CANCELLED', _count: 3 },
          { status: 'SERVED', _count: 6 },
        ]);

        const result = await service.getOrderStatusDistribution({});
        expect(result).toEqual({
          pending: 0,
          accepted: 0,
          preparing: 0,
          ready: 0,
          served: 6,
          completed: 120,
          cancelled: 3,
        });
      });
    });

    describe('getTopItems', () => {
      it('maps raw grouped rows and coerces amounts', async () => {
        prisma.$queryRaw.mockResolvedValue([
          {
            menuItemId: 1n,
            name: 'Veg Cheese Burger',
            category: 'Burgers',
            quantity: 145n,
            revenue: 43500n,
          },
        ]);

        const result = await service.getTopItems({});
        expect(result).toEqual([
          {
            menuItemId: 1,
            name: 'Veg Cheese Burger',
            category: 'Burgers',
            quantitySold: 145,
            revenue: 43500,
          },
        ]);
      });

      it('coerces BigInt menuItemId so JSON serialization never fails', async () => {
        prisma.$queryRaw.mockResolvedValue([
          {
            menuItemId: 7n,
            name: 'Paneer Wrap',
            category: 'Wraps',
            quantity: 2n,
            revenue: 350n,
          },
        ]);
        const result = await service.getTopItems({
          sort: TopItemsSort.REVENUE,
          limit: 5,
        });
        expect(typeof result[0].menuItemId).toBe('number');
        expect(result[0].menuItemId).toBe(7);
        expect(() => JSON.stringify(result)).not.toThrow();
      });
    });

    describe('getPaymentMethods', () => {
      it('computes shares and excludes bills without a method', async () => {
        prisma.billing.groupBy.mockResolvedValue([
          { paymentMethod: 'CASH', _count: 1, _sum: { totalAmount: 1500 } },
          { paymentMethod: 'UPI', _count: 1, _sum: { totalAmount: 500 } },
          { paymentMethod: null, _count: 5, _sum: { totalAmount: 9999 } },
        ]);

        const result = await service.getPaymentMethods({});
        expect(result).toEqual([
          { method: 'CASH', count: 1, amount: 1500, percentage: 75 },
          { method: 'UPI', count: 1, amount: 500, percentage: 25 },
        ]);
      });
    });

    describe('getInventoryOverview', () => {
      it('assigns HEALTHY / LOW / CRITICAL statuses without percentages', async () => {
        prisma.inventoryItem.findMany.mockResolvedValue([
          {
            id: 1,
            name: 'Tomato',
            unit: 'kg',
            quantity: 18,
            lowStockThreshold: 10,
          },
          {
            id: 2,
            name: 'Onion',
            unit: 'kg',
            quantity: 6,
            lowStockThreshold: 10,
          },
          { id: 3, name: 'Oil', unit: 'l', quantity: 0, lowStockThreshold: 10 },
        ]);

        const result = await service.getInventoryOverview();
        expect(result).toEqual([
          {
            id: 1,
            name: 'Tomato',
            unit: 'kg',
            quantity: 18,
            lowStockThreshold: 10,
            status: 'HEALTHY',
          },
          {
            id: 2,
            name: 'Onion',
            unit: 'kg',
            quantity: 6,
            lowStockThreshold: 10,
            status: 'LOW',
          },
          {
            id: 3,
            name: 'Oil',
            unit: 'l',
            quantity: 0,
            lowStockThreshold: 10,
            status: 'CRITICAL',
          },
        ]);
      });
    });

    describe('getLowStockAlerts', () => {
      it('returns only low-stock items with critical severity', async () => {
        prisma.inventoryItem.findMany.mockResolvedValue([
          { name: 'Tomato', unit: 'kg', quantity: 8, lowStockThreshold: 10 },
          { name: 'Onion', unit: 'kg', quantity: 2, lowStockThreshold: 10 },
        ]);

        const result = await service.getLowStockAlerts();
        expect(result).toEqual([
          {
            name: 'Tomato',
            unit: 'kg',
            quantity: 8,
            lowStockThreshold: 10,
            severity: 'LOW',
          },
          {
            name: 'Onion',
            unit: 'kg',
            quantity: 2,
            lowStockThreshold: 10,
            severity: 'CRITICAL',
          },
        ]);
      });
    });

    describe('getRecentOrders', () => {
      it('maps orders with billing info, item count and pagination', async () => {
        const createdAt = new Date('2026-08-10T12:00:00Z');
        prisma.$transaction.mockResolvedValue([
          [
            {
              id: 9,
              orderNumber: 'ORD-9',
              totalAmount: 100,
              status: 'COMPLETED',
              paymentStatus: 'UNPAID',
              createdAt,
              table: { name: 'T1' },
              items: [{ quantity: 2 }, { quantity: 3 }],
              billings: [
                {
                  totalAmount: 250,
                  paymentStatus: 'PAID',
                  paymentMethod: 'UPI',
                },
              ],
            },
          ],
          20,
        ]);

        const result = await service.getRecentOrders({});
        expect(result.items).toEqual([
          {
            orderNumber: 'ORD-9',
            customer: null,
            table: 'T1',
            itemCount: 5,
            totalAmount: 250,
            paymentStatus: 'PAID',
            paymentMethod: 'UPI',
            status: 'COMPLETED',
            createdAt,
          },
        ]);
        expect(result.pagination).toEqual({
          page: 1,
          limit: 10,
          total: 20,
          totalPages: 2,
        });
      });
    });
  });
});
