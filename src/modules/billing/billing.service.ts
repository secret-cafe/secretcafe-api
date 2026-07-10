import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { GenerateBillDto, PayBillDto } from './dto/billing.dto';
import { Prisma, SessionStatus, PaymentStatus, OrderStatus } from 'generated/prisma/client';
import { OrderStatusHistoryService } from '../order/order-status-history.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OrderStatusHistoryService,
  ) { }

  /**
   * Generates a bill for an order.
   *
   * Validates the order exists, is not cancelled, all items are SERVED,
   * and no unpaid bill already exists. Calculates the subtotal from all
   * non-cancelled order items and sub-items, then creates a Billing record.
   *
   * @param dto - The payload containing the order ID, optional mobile number and notes.
   * @param userId - The ID of the user generating the bill (optional).
   * @returns The created billing record.
   */
  public async generateBill(dto: GenerateBillDto, userId?: number) {
    const { orderId, mobileNumber, notes } = dto;

    // Find the order with its items and session
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        status: {
          notIn: [OrderStatus.CANCELLED],
        },
      },
      include: {
        session: {
          select: {
            id: true,
            status: true,
            tableId: true,
            guestCount: true,
            startedAt: true,
            table: {
              select: { id: true, name: true, type: true },
            },
          },
        },
        items: {
          where: { isCancelled: false },
          include: {
            orderSubMenuItem: {
              where: { isCancelled: false },
            },
          },
        },
      },
    });

    if (!order) {
      throwBadRequestException('Order not found or has been cancelled.');
      return;
    }

    // Validate session is active
    if (order.session.status !== SessionStatus.ACTIVE) {
      throwBadRequestException(
        `Cannot generate bill for a ${order.session.status.toLowerCase()} session.`,
      );
      return;
    }

    // Validate all non-cancelled items are SERVED
    const nonServedItems = order.items.filter(
      (item) => item.status !== OrderStatus.SERVED,
    );

    if (nonServedItems.length > 0) {
      const itemNames = nonServedItems
        .map((item) => `Item #${item.id} (status: ${item.status})`)
        .join(', ');
      throwBadRequestException(
        `Cannot generate bill. All items must be served first. Pending items: ${itemNames}`,
      );
      return;
    }

    // Check for existing unpaid bill for this order
    const existingBill = await this.prisma.billing.findFirst({
      where: {
        orderId,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    if (existingBill) {
      throwBadRequestException(
        `An unpaid bill (${existingBill.billNumber}) already exists for this order.`,
      );
      return;
    }

    // Calculate subtotal from all non-cancelled items and sub-items
    let subtotal = new Prisma.Decimal(0);

    for (const item of order.items) {
      subtotal = subtotal.add(item.totalPrice);
      for (const sub of item.orderSubMenuItem) {
        subtotal = subtotal.add(sub.totalPrice);
      }
    }

    if (subtotal.isZero()) {
      throwBadRequestException(
        'Cannot generate bill with zero total. No active items in the order.',
      );
      return;
    }

    // Generate a unique bill number
    const billNumber = await this.generateBillNumber();

    // Create the billing record within a transaction
    const billing = await this.prisma.$transaction(async (tx) => {
      const created = await tx.billing.create({
        data: {
          sessionId: order.sessionId,
          orderId: order.id,
          billNumber,
          subtotal,
          totalAmount: subtotal, // For now, total = subtotal (no tax/discount/service charge)
          paymentStatus: PaymentStatus.UNPAID,
          mobileNumber: mobileNumber || null,
          notes: notes || null,
          createdBy: userId || null,
        },
        include: {
          session: {
            select: {
              id: true,
              tableId: true,
              guestCount: true,
              startedAt: true,
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

      // Update the order's payment status to UNPAID (explicit)
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.UNPAID },
      });

      return created;
    });

    return {
      status: true,
      message: 'Bill generated successfully.',
      data: this.transformBillResponse(billing),
    };
  }

  /**
   * Marks a bill as paid.
   *
   * Validates the billing record exists and is unpaid, then updates
   * the payment status, method, and timestamp within a transaction.
   * Also marks the order and all non-cancelled order items as COMPLETED.
   *
   * @param dto - The payload containing the billing ID and payment method.
   * @returns The updated billing record.
   */
  public async payBill(dto: PayBillDto) {
    const { billingId, paymentMethod, notes } = dto;

    const billing = await this.prisma.billing.findUnique({
      where: { id: billingId },
      select: {
        id: true,
        orderId: true,
        billNumber: true,
        paymentStatus: true,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const paid = await tx.billing.update({
        where: { id: billingId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod,
          paidAt: new Date(),
          notes: notes || undefined,
        },
        include: {
          session: {
            select: {
              id: true,
              tableId: true,
              guestCount: true,
              startedAt: true,
              table: {
                select: { id: true, name: true, type: true },
              },
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
      });

      // Mark the order and all non-cancelled items as COMPLETED
      if (billing.orderId) {
        await tx.orderItem.updateMany({
          where: {
            orderId: billing.orderId,
            isCancelled: false,
          },
          data: {
            status: OrderStatus.COMPLETED,
          },
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

      return paid;
    });

    // Log the order-level COMPLETED transition triggered by payment
    if (billing.orderId) {
      await this.history.log({
        orderId: billing.orderId,
        fromStatus: OrderStatus.SERVED,
        toStatus: OrderStatus.COMPLETED,
        reason: `Payment completed (${paymentMethod})`,
        metadata: { billingId, billNumber: billing.billNumber },
      });
    }

    return {
      status: true,
      message: 'Payment recorded successfully.',
      data: this.transformBillResponse(updated),
    };
  }

  /**
   * Retrieves a bill by order ID.
   *
   * @param orderId - The ID of the order to look up.
   * @returns The billing record for the order.
   */
  public async getBillByOrder(orderId: number) {
    const billing = await this.prisma.billing.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
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
      throwNotFoundException(`No bill found for order ID ${orderId}.`);
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
   *
   * @returns A list of all billing records.
   */
  public async getAllBills() {
    const bills = await this.prisma.billing.findMany({
      orderBy: { createdAt: 'desc' },
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
   * Generates a unique bill number.
   *
   * Format: BILL-{YYYYMMDD}-{XXXX} where XXXX is a zero-padded
   * sequential number based on the count of bills created today.
   */
  private async generateBillNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Count bills created today
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const count = await this.prisma.billing.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
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
      id: billing.id,
      billNumber: billing.billNumber,
      sessionId: billing.sessionId,
      orderId: billing.orderId,
      subtotal: billing.subtotal,
      taxAmount: billing.taxAmount,
      discountAmount: billing.discountAmount,
      serviceCharge: billing.serviceCharge,
      totalAmount: billing.totalAmount,
      paymentStatus: billing.paymentStatus,
      paymentMethod: billing.paymentMethod,
      paidAt: billing.paidAt,
      mobileNumber: billing.mobileNumber,
      notes: billing.notes,
      createdAt: billing.createdAt,
      session: billing.session
        ? {
            id: billing.session.id,
            tableId: billing.session.tableId,
            tableName: billing.session.table?.name,
            tableType: billing.session.table?.type,
            guestCount: billing.session.guestCount,
            startedAt: billing.session.startedAt,
            endedAt: billing.session.endedAt,
          }
        : null,
      order: billing.order
        ? {
            id: billing.order.id,
            orderNumber: billing.order.orderNumber,
            items: billing.order.items
              ? billing.order.items.map((item: any) => ({
                  id: item.id,
                  menuItemId: item.menuItemId,
                  menuItemName: item.menuItem?.name,
                  unitPrice: item.unitPrice,
                  quantity: item.quantity,
                  totalPrice: item.totalPrice,
                  notes: item.notes,
                  subMenuItems: item.orderSubMenuItem?.map((sub: any) => ({
                    id: sub.id,
                    subMenuItemId: sub.subMenuItemId,
                    subMenuItemName: sub.subMenuItem?.name,
                    unitPrice: sub.unitPrice,
                    quantity: sub.quantity,
                    totalPrice: sub.totalPrice,
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