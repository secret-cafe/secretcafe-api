import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrderStatus } from 'generated/prisma/client';

export interface StatusLogInput {
  orderId: number;
  itemId?: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class OrderStatusHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Logs a status transition for an order or order item.
   *
   * - `itemId` = null   → order-level transition
   * - `itemId` = number → item-level transition
   */
  public async log(input: StatusLogInput) {
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: input.orderId,
        itemId: input.itemId ?? null,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        changedBy: input.changedBy ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  /**
   * Retrieves the full status timeline for an order.
   * Ordered oldest-first for a chronological view.
   *
   * Only public UUIDs (`orderId`, `orderItemId`, `menuId`) are returned for
   * the related records so internal numeric primary keys never leak.
   */
  public async getHistoryForOrder(orderId: number) {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        order: {
          select: { orderId: true },
        },
        item: {
          select: {
            orderItemId: true,
            menuItem: { select: { menuId: true, name: true } },
          },
        },
      },
    });
  }
}