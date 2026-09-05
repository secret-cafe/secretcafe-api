import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  throwBadRequestException,
  throwNotFoundException,
} from 'src/common/utils/http-exception.helper';
import { GenerateBillDto, PayBillDto } from './dto/billing.dto';
import { QueryBillingDto } from './dto/query-billing.dto';
import { BillingWithRelations, billingInclude } from './billing.types';
import {
  Prisma,
  SessionStatus,
  PaymentStatus,
  OrderStatus,
  TableType,
  PaymentMethod,
  DiscountType,
} from 'generated/prisma/client';
import { OrderStatusHistoryService } from '../order/order-status-history.service';
import { TableService } from '../table/table.service';
import { calculateDiscounts } from './discount-calculator';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OrderStatusHistoryService,
    private readonly tableService: TableService,
  ) {}

  /** Shared relation include for bill queries (defined once in billing.types). */
  private readonly billingInclude = billingInclude;

  /**
   * Resolves the public table UUID into the internal numeric table id.
   * Reused by generateBill and getBillByTable; centralizes the table lookup.
   */
  private async resolveTableIdOrThrow(tableId: string): Promise<number> {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { tableId, deletedAt: null },
      select: { id: true },
    });

    if (!table) {
      throwNotFoundException(`Table with ID ${tableId} not found.`);
    }
    return table!.id;
  }

  /**
   * Validates that all non-cancelled items in an order are SERVED.
   * Throws if any item is pending.
   */
  private validateAllItemsServed(order: any) {
    if (!order) return;

    const nonServedItems = order.items.filter(
      (item: any) => item.status !== OrderStatus.SERVED,
    );
    if (nonServedItems.length > 0) {
      const names = nonServedItems
        .map((i: any) => `Item #${i.id} (status: ${i.status})`)
        .join(', ');
      throwBadRequestException(
        `All items must be served first. Pending: ${names}`,
      );
    }
  }

  /**
   * Sums the total price of all non-cancelled items (and their sub-items).
   */
  private calculateItemSubtotal(order: any): Prisma.Decimal {
    let subtotal = new Prisma.Decimal(0);
    if (!order) return subtotal;

    for (const item of order.items) {
      subtotal = subtotal.add(item.totalPrice);
      for (const sub of item.orderSubMenuItem) {
        subtotal = subtotal.add(sub.totalPrice);
      }
    }
    return subtotal;
  }

  /**
   * Applies the time-based charge for POD / HALL sessions when time rate is enabled
   * and rush mode is off. Returns null when no time charge applies.
   */
  private calculateTimeCharge(session: any): Prisma.Decimal | null {
    let timeCharge: Prisma.Decimal | null = null;

    if (session?.rushMode) return null;

    const tableType = session?.table?.type;
    const isTimeRateTable =
      tableType === TableType.POD || tableType === TableType.HALL;
    if (!isTimeRateTable || !session.enableTimeRate) return null;

    const startTime = session.timerStartedAt ?? session.startedAt;
    if (!startTime) {
      throwBadRequestException(
        'Timer not started for this session. Cannot calculate time charge.',
      );
      return null;
    }

    const end = new Date();
    const elapsedMinutes = Math.ceil(
      (end.getTime() - startTime.getTime()) / (1000 * 60),
    );
    const multiplier = session.chargePerPerson ? session.guestCount : 1;

    // HALL tables: use ratePerHour if available
    if (session.ratePerHour) {
      const elapsedHours = elapsedMinutes / 60;
      timeCharge = new Prisma.Decimal(
        Number(session.ratePerHour) * elapsedHours * multiplier,
      );
    } else if (session.ratePerMinute) {
      // POD / default: use ratePerMinute
      timeCharge = new Prisma.Decimal(
        Number(session.ratePerMinute) * elapsedMinutes * multiplier,
      );
    }

    return timeCharge;
  }

  /**
   * Resolves requested discounts (by public UUID) into internal discount records.
   * Only active, non-deleted discounts are accepted; values are never trusted
   * from the frontend.
   */
  private async resolveDiscounts(
    requestedDiscounts: { discountId: string; sequence: number }[],
    itemSubtotal: Prisma.Decimal,
  ) {
    const discountIds = requestedDiscounts.map((d) => d.discountId);

    const fetchedDiscounts = await this.prisma.discount.findMany({
      where: { discountId: { in: discountIds }, deletedAt: null, isActive: true },
      select: { id: true, discountId: true, type: true, value: true },
    });

    if (fetchedDiscounts.length !== discountIds.length) {
      throwBadRequestException(
        'One or more discounts are invalid, inactive, or deleted.',
      );
      return null;
    }

    const discountMap = new Map(
      fetchedDiscounts.map((d) => [d.discountId, d]),
    );

    return calculateDiscounts(
      itemSubtotal,
      requestedDiscounts.map((d) => {
        const discount = discountMap.get(d.discountId)!;
        return {
          discountId: discount.id,
          type: discount.type,
          value: discount.value,
          sequence: d.sequence,
        };
      }),
    );
  }

  /**
   * Generates a bill for a table.
   *
   * **FAMILY tables:** Requires an order with all items SERVED. Total = item subtotal.
   * **POD / HALL tables:** Can bill with or without an order. Includes time-based charge
   * (elapsed minutes × ratePerMinute). If an order exists, validates items are SERVED
   * and adds item subtotal to the total.
   *
   * @param dto - Payload with tableId (UUID), optional mobileNumber and notes.
   * @param userId - The ID of the user generating the bill (optional).
   */
  public async generateBill(dto: GenerateBillDto, userId?: number) {
    const { mobileNumber, notes, discounts: requestedDiscounts } = dto;

    // 1. Resolve public table UUID into internal numeric table id and find active session
    const tableId = await this.resolveTableIdOrThrow(dto.tableId);
    const session = await this.prisma.tableSession.findFirst({
      where: { tableId, status: SessionStatus.ACTIVE },
      include: {
        table: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!session) {
      throwBadRequestException('No active session found for this table.');
      return;
    }

    const tableType = session.table.type;
    const isTimeRateTable =
      tableType === TableType.POD || tableType === TableType.HALL;

    // 2. Check for existing unpaid bill for this session
    const existingBill = await this.prisma.billing.findFirst({
      where: {
        sessionId: session.id,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    if (existingBill) {
      throwBadRequestException(
        `An unpaid bill (${existingBill.billNumber}) already exists for this session.`,
      );
      return;
    }

    // 3. Find any non-cancelled order for this session
    const order = await this.prisma.order.findFirst({
      where: {
        sessionId: session.id,
        status: { notIn: [OrderStatus.CANCELLED] },
      },
      include: {
        items: {
          where: { isCancelled: false },
          include: {
            orderSubMenuItem: { where: { isCancelled: false } },
          },
        },
      },
    });

    // 4. Validate order requirements per table type
    if (tableType === TableType.FAMILY) {
      // FAMILY tables MUST have an order with served items
      if (!order) {
        throwBadRequestException(
          'No active order found for this FAMILY table. An order is required for billing.',
        );
        return;
      }
      this.validateAllItemsServed(order);
    } else if (isTimeRateTable && order) {
      // POD/HALL: if an order exists, validate items are served
      this.validateAllItemsServed(order);
    }

    // 5. Calculate item subtotal (if order exists)
    const itemSubtotal = this.calculateItemSubtotal(order);

    // 6. Calculate time charge (POD / HALL with time rate enabled; skipped in rush mode)
    const timeChargeAmount = this.calculateTimeCharge(session);

    // 7. Apply discounts against the item subtotal only (if any requested)
    let discountAmount = new Prisma.Decimal(0);
    let appliedDiscounts: {
      discountId: number;
      type: DiscountType;
      value: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      sequence: number;
    }[] = [];

    if (requestedDiscounts && requestedDiscounts.length > 0) {
      const calculation = await this.resolveDiscounts(
        requestedDiscounts,
        itemSubtotal,
      );

      if (calculation) {
        discountAmount = calculation.totalDiscount;
        appliedDiscounts = calculation.discounts;
      }
    }

    // 8. Total (discount applies to item subtotal only; time charge is undiscounted)
    const totalAmount = itemSubtotal
      .sub(discountAmount)
      .add(timeChargeAmount ?? new Prisma.Decimal(0));

    if (totalAmount.isZero()) {
      throwBadRequestException(
        'Cannot generate bill with zero total. No charges to bill.',
      );
      return;
    }

    // 9. Generate bill number
    const billNumber = await this.generateBillNumber();

    // 10. Create billing record + discount snapshots within a transaction
    await this.prisma.$transaction(async (tx) => {
      const billing = await tx.billing.create({
        data: {
          billingId: randomUUID(),
          sessionId: session.id,
          orderId: order?.id ?? null,
          billNumber,
          subtotal: itemSubtotal,
          timeChargeAmount,
          discountAmount,
          totalAmount,
          paymentStatus: PaymentStatus.UNPAID,
          mobileNumber: mobileNumber || null,
          notes: notes || null,
          createdBy: userId || null,
        },
      });

      // Persist historical discount snapshots
      if (appliedDiscounts.length > 0) {
        await tx.billingDiscount.createMany({
          data: appliedDiscounts.map((d) => ({
            billingId: billing.id,
            discountId: d.discountId,
            discountType: d.type,
            discountValue: d.value,
            discountAmount: d.discountAmount,
            sequence: d.sequence,
          })),
        });
      }

      // Update the order's payment status if an order exists
      if (order) {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.UNPAID },
        });
      }
    });

    return {
      status: true,
      message: 'Bill generated successfully.',
    };
  }

  /**
   * Marks a bill as paid.
   *
   * Updates billing status, marks order and all non-cancelled items as COMPLETED
   * (if an order is linked), and logs the status transition.
   */
  public async payBill(dto: PayBillDto, userId?: number) {
    const { billingId, paymentMethod, cashAmount, onlineAmount, notes } = dto;

    const billing = await this.prisma.billing.findUnique({
      where: { billingId },
      select: {
        id: true,
        billingId: true,
        orderId: true,
        billNumber: true,
        paymentStatus: true,
        totalAmount: true,
        session: {
          select: {
            tableId: true,
          },
        },
      },
    });

    if (!billing) {
      throwNotFoundException(`Bill with ID ${billingId} not found.`);
      return;
    }

    if (billing.paymentStatus === PaymentStatus.PAID) {
      throwBadRequestException('This bill has already been paid.');
      return;
    }

    if (billing.paymentStatus === PaymentStatus.REFUNDED) {
      throwBadRequestException('Cannot pay a refunded bill.');
      return;
    }

    // Validate CASH_ONLINE split amounts
    if (paymentMethod === PaymentMethod.CASH_ONLINE) {
      if (cashAmount === undefined || onlineAmount === undefined) {
        throwBadRequestException(
          'cashAmount and onlineAmount are required for CASH_ONLINE payment.',
        );
        return;
      }

      const totalSplit = new Prisma.Decimal(cashAmount).add(
        new Prisma.Decimal(onlineAmount),
      );
      if (!totalSplit.equals(billing.totalAmount)) {
        throwBadRequestException(
          `Cash (${cashAmount}) + Online (${onlineAmount}) = ${totalSplit.toString()} does not match bill total (${billing.totalAmount.toString()}).`,
        );
        return;
      }
    }

    const updateData: any = {
      paymentStatus: PaymentStatus.PAID,
      paymentMethod,
      paidAt: new Date(),
      notes: notes || undefined,
      updatedBy: userId || null,
    };

    // Store split amounts for CASH_ONLINE
    if (paymentMethod === PaymentMethod.CASH_ONLINE) {
      updateData.cashAmount = cashAmount;
      updateData.onlineAmount = onlineAmount;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.billing.update({
        where: { id: billing.id },
        data: updateData,
      });

      // Mark the order and all non-cancelled items as COMPLETED
      if (billing.orderId) {
        await tx.orderItem.updateMany({
          where: { orderId: billing.orderId, isCancelled: false },
          data: { status: OrderStatus.COMPLETED },
        });

        await tx.order.update({
          where: { id: billing.orderId },
          data: {
            paymentStatus: PaymentStatus.PAID,
            status: OrderStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }
    });

    // Log the order-level COMPLETED transition
    if (billing.orderId) {
      await this.history.log({
        orderId: billing.orderId,
        fromStatus: OrderStatus.SERVED,
        toStatus: OrderStatus.COMPLETED,
        reason: `Payment completed (${paymentMethod})`,
        metadata: {
          billingId: billing.billingId,
          billNumber: billing.billNumber,
        },
      });
    }

    // Close the table session and set table to CLEANING via TableService
    await this.tableService.handleTableSession({
      tableId: billing.session.tableId,
      status: 'CLEANING',
    });

    return {
      status: true,
      message: 'Payment recorded successfully.',
    };
  }

  /**
   * Retrieves a bill by table UUID (looks up via the latest session).
   */
  public async getBillByTable(tableId: string) {
    const internalTableId = await this.resolveTableIdOrThrow(tableId);
    const session = await this.prisma.tableSession.findFirst({
      where: { tableId: internalTableId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!session) {
      throwNotFoundException(`No session found for table ID ${tableId}.`);
      return;
    }

    const billing = await this.prisma.billing.findFirst({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      include: this.billingInclude,
    });

    if (!billing) {
      throwNotFoundException(`No bill found for table ID ${tableId}.`);
      return;
    }

    return {
      status: true,
      message: 'Bill fetched successfully.',
      data: this.transformBillResponse(billing),
    };
  }

  /**
   * Retrieves all bills, ordered by most recent first.
   */
  public async getAllBills(query: QueryBillingDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [bills, total] = await this.prisma.$transaction([
      this.prisma.billing.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: this.billingInclude,
      }),
      this.prisma.billing.count(),
    ]);

    return {
      status: true,
      message: 'Bills fetched successfully.',
      data: bills.map((bill) => this.transformBillResponse(bill)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // #region Private Helpers

  /**
   * Generates a unique bill number in the format BILL-{YYYYMMDD}-{XXXX}.
   */
  private async generateBillNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const count = await this.prisma.billing.count({
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `BILL-${dateStr}-${sequence}`;
  }

  /**
   * Transforms a raw billing record into a structured response format.
   */
  private transformBillResponse(billing: BillingWithRelations): any {
    return {
      billingId: billing.billingId,
      billNumber: billing.billNumber,
      tableId: billing.session.table?.tableId ?? null,
      orderId: billing.order?.orderId ?? null,
      subtotal: billing.subtotal,
      taxAmount: billing.taxAmount,
      discountAmount: billing.discountAmount,
      serviceCharge: billing.serviceCharge,
      timeChargeAmount: billing.timeChargeAmount,
      cashAmount: billing.cashAmount,
      onlineAmount: billing.onlineAmount,
      totalAmount: billing.totalAmount,
      paymentStatus: billing.paymentStatus,
      paymentMethod: billing.paymentMethod,
      paidAt: billing.paidAt,
      mobileNumber: billing.mobileNumber,
      notes: billing.notes,
      createdAt: billing.createdAt,
      totalDiscount: billing.discountAmount,
      discounts: billing.billingDiscounts
        ? billing.billingDiscounts.map((d: any) => ({
            discountId: d.discount?.discountId ?? null,
            discountName: d.discount?.name,
            discountType: d.discountType,
            discountValue: d.discountValue,
            discountAmount: d.discountAmount,
            sequence: d.sequence,
          }))
        : [],
      session: billing.session
        ? {
            tableId: billing.session.table?.tableId ?? null,
            tableName: billing.session.table?.name,
            tableType: billing.session.table?.type,
            guestCount: billing.session.guestCount,
          }
        : null,
      order: billing.order
        ? {
            orderId: billing.order.orderId,
            orderNumber: billing.order.orderNumber,
            items: billing.order.items
              ? billing.order.items.map((item: any) => ({
                  orderItemId: item.orderItemId,
                  menuItemName: item.menuItem?.name,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                  quantity: item.quantity,
                  notes: item.notes,
                  isCancelled: item.isCancelled,
                  subMenuItems: item.orderSubMenuItem?.map((sub: any) => ({
                    orderSubMenuItemId: sub.orderSubMenuItemId,
                    subMenuItemName: sub.subMenuItem?.name,
                    unitPrice: sub.unitPrice,
                    totalPrice: sub.totalPrice,
                    quantity: sub.quantity,
                    isCancelled: sub.isCancelled,
                    notes: sub.notes,
                  })),
                }))
              : [],
          }
        : null,
    };
  }

  // #endregion
}
