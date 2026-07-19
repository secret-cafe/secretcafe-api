import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { GenerateBillDto, PayBillDto } from './dto/billing.dto';
import { Prisma, SessionStatus, PaymentStatus, OrderStatus, TableType, PaymentMethod } from 'generated/prisma/client';
import { OrderStatusHistoryService } from '../order/order-status-history.service';
import { TableService } from '../table/table.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OrderStatusHistoryService,
    private readonly tableService: TableService,
  ) { }

  /**
   * Generates a bill for a table.
   *
   * **FAMILY tables:** Requires an order with all items SERVED. Total = item subtotal.
   * **POD / HALL tables:** Can bill with or without an order. Includes time-based charge
   * (elapsed minutes × ratePerMinute). If an order exists, validates items are SERVED
   * and adds item subtotal to the total.
   *
   * @param dto - Payload with tableId, optional mobileNumber and notes.
   * @param userId - The ID of the user generating the bill (optional).
   */
  public async generateBill(dto: GenerateBillDto, userId?: number) {
    const { tableId, mobileNumber, notes } = dto;

    // 1. Find active session for this table
    const session = await this.prisma.tableSession.findFirst({
      where: { tableId, status: SessionStatus.ACTIVE },
      include: {
        table: {
          select: { id: true, name: true, type: true, enableTimeRate: true, ratePerMinute: true, chargePerPerson: true },
        },
      },
    });

    if (!session) {
      throwBadRequestException('No active session found for this table.');
      return;
    }

    const tableType = session.table.type;
    const isTimeRateTable = tableType === TableType.POD || tableType === TableType.HALL;

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
        throwBadRequestException('No active order found for this FAMILY table. An order is required for billing.');
        return;
      }

      const nonServedItems = order.items.filter((item) => item.status !== OrderStatus.SERVED);
      if (nonServedItems.length > 0) {
        const names = nonServedItems.map((i) => `Item #${i.id} (status: ${i.status})`).join(', ');
        throwBadRequestException(`All items must be served first. Pending: ${names}`);
        return;
      }
    } else if (isTimeRateTable && order) {
      // POD/HALL: if an order exists, validate items are served
      const nonServedItems = order.items.filter((item) => item.status !== OrderStatus.SERVED);
      if (nonServedItems.length > 0) {
        const names = nonServedItems.map((i) => `Item #${i.id} (status: ${i.status})`).join(', ');
        throwBadRequestException(`All items must be served first. Pending: ${names}`);
        return;
      }
    }

    // 5. Calculate item subtotal (if order exists)
    let itemSubtotal = new Prisma.Decimal(0);
    if (order) {
      for (const item of order.items) {
        itemSubtotal = itemSubtotal.add(item.totalPrice);
        for (const sub of item.orderSubMenuItem) {
          itemSubtotal = itemSubtotal.add(sub.totalPrice);
        }
      }
    }

    // 6. Calculate time charge (POD / HALL with time rate enabled)
    //    Skip time-based and per-person charges when rushMode is active.
    let timeChargeAmount: Prisma.Decimal | null = null;
    let totalMinutes: number | null = null;

    if (!session.rushMode && isTimeRateTable && session.enableTimeRate) {
      const startTime = session.timerStartedAt ?? session.startedAt;
      if (!startTime) {
        throwBadRequestException('Timer not started for this session. Cannot calculate time charge.');
        return;
      }
      const end = new Date();
      const elapsedMinutes = Math.ceil((end.getTime() - startTime.getTime()) / (1000 * 60));
      const multiplier = session.chargePerPerson ? session.guestCount : 1;

      totalMinutes = elapsedMinutes;

      // HALL tables: use ratePerHour if available
      if (session.ratePerHour) {
        const elapsedHours = elapsedMinutes / 60;
        timeChargeAmount = new Prisma.Decimal(Number(session.ratePerHour) * elapsedHours * multiplier);
      } else if (session.ratePerMinute) {
        // POD / default: use ratePerMinute
        timeChargeAmount = new Prisma.Decimal(Number(session.ratePerMinute) * elapsedMinutes * multiplier);
      }
    }

    // 7. Total
    const totalAmount = itemSubtotal.add(timeChargeAmount ?? new Prisma.Decimal(0));

    if (totalAmount.isZero()) {
      throwBadRequestException('Cannot generate bill with zero total. No charges to bill.');
      return;
    }

    // 8. Generate bill number
    const billNumber = await this.generateBillNumber();

    // 9. Create billing record within a transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.billing.create({
        data: {
          sessionId: session.id,
          orderId: order?.id ?? null,
          billNumber,
          subtotal: itemSubtotal,
          timeChargeAmount,
          totalAmount,
          paymentStatus: PaymentStatus.UNPAID,
          mobileNumber: mobileNumber || null,
          notes: notes || null,
          createdBy: userId || null,
        }
      });

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
      message: 'Bill generated successfully.'
    };
  }

  /**
   * Marks a bill as paid.
   *
   * Updates billing status, marks order and all non-cancelled items as COMPLETED
   * (if an order is linked), and logs the status transition.
   */
  public async payBill(dto: PayBillDto) {
    const { billingId, paymentMethod, cashAmount, onlineAmount, notes } = dto;

    const billing = await this.prisma.billing.findUnique({
      where: { id: billingId },
      select: {
        id: true,
        orderId: true,
        billNumber: true,
        paymentStatus: true,
        totalAmount: true,
        session: {
          select: { tableId: true },
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
        throwBadRequestException('cashAmount and onlineAmount are required for CASH_ONLINE payment.');
        return;
      }

      const totalSplit = new Prisma.Decimal(cashAmount).add(new Prisma.Decimal(onlineAmount));
      if (!totalSplit.equals(billing.totalAmount)) {
        throwBadRequestException(
          `Cash (${cashAmount}) + Online (${onlineAmount}) = ${totalSplit} does not match bill total (${billing.totalAmount}).`,
        );
        return;
      }
    }

    const updateData: any = {
      paymentStatus: PaymentStatus.PAID,
      paymentMethod,
      paidAt: new Date(),
      notes: notes || undefined,
    };

    // Store split amounts for CASH_ONLINE
    if (paymentMethod === PaymentMethod.CASH_ONLINE) {
      updateData.cashAmount = cashAmount;
      updateData.onlineAmount = onlineAmount;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.billing.update({
        where: { id: billingId },
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
        metadata: { billingId, billNumber: billing.billNumber },
      });
    }

    // Close the table session and set table to CLEANING via TableService
    await this.tableService.handleTableSession({
      tableId: billing.session.tableId,
      status: 'CLEANING',
    });

    return {
      status: true,
      message: 'Payment recorded successfully.'
    };
  }

  /**
   * Retrieves a bill by table ID (looks up via the latest session).
   */
  public async getBillByTable(tableId: number) {
    const session = await this.prisma.tableSession.findFirst({
      where: { tableId },
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
      include: {
        session: {
          select: {
            id: true,
            tableId: true,
            guestCount: true,
            startedAt: true,
            endedAt: true,
            table: {
              select: { id: true, name: true, type: true },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            items: {
              where: { isCancelled: false },
              include: {
                menuItem: {
                  select: { id: true, name: true, price: true },
                },
                orderSubMenuItem: {
                  where: { isCancelled: false },
                  include: {
                    subMenuItem: {
                      select: { id: true, name: true, price: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
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
  public async getAllBills() {
    const bills = await this.prisma.billing.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        session: {
          select: {
            id: true,
            tableId: true,
            guestCount: true,
            table: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            items: {
              select: {
                id: true,
                status: true,
                quantity: true,
                unitPrice: true,
                totalPrice: true,
                notes: true,
                isCancelled: true,
                menuItem: {
                  select: { 
                    name: true,
                  },
                },
                orderSubMenuItem: {
                  select: {
                    id: true,
                    quantity: true,
                    unitPrice: true,
                    totalPrice: true,
                    notes: true,
                    isCancelled: true,
                    subMenuItem: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      status: true,
      message: 'Bills fetched successfully.',
      data: bills.map((bill) => this.transformBillResponse(bill)),
    };
  }

  // #region Private Helpers

  /**
   * Generates a unique bill number in the format BILL-{YYYYMMDD}-{XXXX}.
   */
  private async generateBillNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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
  private transformBillResponse(billing: any): any {
    return {
      billingId: billing.id,
      billNumber: billing.billNumber,
      sessionId: billing.sessionId,
      orderId: billing.orderId,
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
      session: billing.session
        ? {
          tableSessionId: billing.session.id,
          tableId: billing.session.tableId,
          tableName: billing.session.table?.name,
          tableType: billing.session.table?.type,
          guestCount: billing.session.guestCount,
        }
        : null,
      order: billing.order
        ? {
          orderId: billing.order.id,
          orderNumber: billing.order.orderNumber,
          items: billing.order.items
            ? billing.order.items.map((item: any) => ({
              orderItemId: item.id,
              menuItemName: item.menuItem?.name,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              quantity: item.quantity,
              notes: item.notes,
              isCancelled: item.isCancelled,
              subMenuItems: item.orderSubMenuItem?.map((sub: any) => ({
                orderSubMenuItemId: sub.id,
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