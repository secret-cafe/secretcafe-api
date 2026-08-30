import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrderValidationService } from './order-validation.service';
import { OrderItemService } from './order-item.service';
import { OrderStatusHistoryService } from './order-status-history.service';
import { ProcessOrderDto, UpdateOrderItemDto, UpdateOrderStatusDto } from './dto/order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { OrderStatus, SessionStatus } from 'generated/prisma/enums';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { Role } from 'src/common/constants/constants';

/**
 * Thin orchestrator for order lifecycle.
 *
 * - `processOrder()` handles both CREATE and UPDATE in a single unified flow.
 *   The method checks for an existing order by sessionId — no `orderId` is
 *   needed from the client.
 * - Items with `isCancelled: true` are explicitly cancelled; items with
 *   `orderItemId` are updated; new items are created.
 * - All item-level logic is delegated to `OrderItemService`.
 * - All validation is delegated to `OrderValidationService`.
 */
@Injectable()
export class OrderService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly validation: OrderValidationService,
        private readonly itemService: OrderItemService,
        private readonly history: OrderStatusHistoryService,
    ) { }

    // #region Query Selectors (Single Source of Truth)

    private readonly orderSelect = {
        orderId: true,
        table: { select: { tableId: true } },
        orderNumber: true,
        orderType: true,
        status: true,
        paymentStatus: true,
        subtotal: true,
        taxAmount: true,
        discountAmount: true,
        serviceCharge: true,
        timeChargeAmount: true,
        totalAmount: true,
        notes: true,
        items: {
            select: {
                orderItemId: true,
                status: true,
                quantity: true,
                unitPrice: true,
                totalPrice: true,
                notes: true,
                isCancelled: true,
                menuItem: {
                    select: { menuId: true, name: true, price: true, menuType: true },
                },
                orderSubMenuItem: {
                    select: {
                        orderSubMenuItemId: true,
                        quantity: true,
                        unitPrice: true,
                        totalPrice: true,
                        notes: true,
                        isCancelled: true,
                        subMenuItem: {
                            select: { subMenuId: true, name: true, price: true },
                        },
                    },
                },
            },
        },
    } as const;

    // #endregion

    // #region Process Order (CREATE + UPDATE)

    /**
     * Unified entry-point for placing or updating an order.
     *
     * The method checks for an existing order by **sessionId** (derived from
     * the `tableId`). No `orderId` is required from the client.
     *
     * **Items behaviour:**
     * - `orderItemId` absent                        → create new item
     * - `orderItemId` present + `isCancelled: false` → update existing item
     * - `orderItemId` present + `isCancelled: true`  → cancel existing item
     *
     * All IDs in the DTO (`tableId`, `menuItemId`, `subMenuItemId`, `orderItemId`)
     * are public UUIDs. The internal numeric primary keys are never accepted or returned.
     */
    public async processOrder(dto: ProcessOrderDto, createdById?: number) {
        // 1. Validate session (resolved via the table UUID)
        const session = await this.prisma.tableSession.findFirst({
            where: { table: { tableId: dto.tableId }, status: SessionStatus.ACTIVE },
        });

        if (!session) {
            throwBadRequestException('Table active session not found.');
            return;
        }

        if (!dto.orderItems?.length) {
            throwBadRequestException('Order items are required.');
            return;
        }

        let orderId: string | undefined;
        let internalId: number | undefined;
        let isNew = false;

        // 2. Execute within a single transaction
        await this.prisma.$transaction(async (tx) => {
            // Look up existing order by session (no orderId from client needed)
            const existing = await tx.order.findFirst({
                where: { sessionId: session.id },
                select: { id: true, orderId: true, status: true },
            });

            if (existing && (existing.status === OrderStatus.COMPLETED || existing.status === OrderStatus.CANCELLED)) {
                throwBadRequestException(`Cannot update a ${existing.status.toLowerCase()} order.`);
                return;
            }

            // === UPDATE FLOW ===
            if (existing) {
                const recalculatedSubtotal = await this.itemService.applyItemChanges(
                    tx,
                    existing.id,
                    dto.orderItems,
                    createdById,
                );

                await tx.order.update({
                    where: { id: existing.id },
                    data: {
                        notes: dto.notes ?? undefined,
                        subtotal: recalculatedSubtotal,
                        totalAmount: recalculatedSubtotal,
                        updatedBy: createdById ?? null,
                    },
                });

                orderId = existing.orderId ?? undefined;
                internalId = existing.id;
            }
            // === CREATE FLOW ===
            else {
                const { subtotal, itemsData } = await this.itemService.prepareNewItems(
                    tx,
                    dto.orderItems,
                    createdById,
                );

                const created = await tx.order.create({
                    data: {
                        orderId: randomUUID(),
                        orderNumber: `ORD-${Date.now()}`,
                        tableId: session.tableId,
                        sessionId: session.id,
                        subtotal,
                        totalAmount: subtotal,
                        notes: dto.notes,
                        createdBy: createdById ?? null,
                        items: { create: itemsData },
                    },
                });

                orderId = created.orderId ?? undefined;
                internalId = created.id;
                isNew = true;
            }
        });

        // 3. Sync order-level status (outside transaction for simplicity)
        await this.syncOrderStatus(internalId!);

        return {
            status: true,
            message: isNew ? 'Order placed successfully.' : 'Order updated successfully.',
            orderId: orderId!,
        };
    }

    // #endregion

    // #region Status Updates

    /**
     * Updates the status of an entire order.
     *
     * When `dto.isItemsUpdate` is `true`, also updates all non-cancelled
     * order items to the same status and syncs the order-level status
     * from the items. When `false` (default), only the order-level status
     * is updated directly.
     */
    public async updateOrderStatus(dto: UpdateOrderStatusDto, role: Role, updatedById?: number) {
        const order = await this.prisma.order.findFirst({
            where: { orderId: dto.orderId },
            select: { id: true, status: true },
        });

        if (!order) {
            throwBadRequestException('Order not found.');
            return;
        }

        this.validation.validateNotDirectlyCompleted(dto.status);
        this.validation.validateRolePermission(role, dto.status);
        this.validation.isValidStatusTransition(order.status, dto.status);

        if (dto.isItemsUpdate) {
            // 1. Fetch current item statuses BEFORE updating
            const currentItems = await this.prisma.orderItem.findMany({
                where: { orderId: order.id, isCancelled: false },
                select: { id: true, status: true },
            });

            // 2. Update all items to the new status
            await this.prisma.orderItem.updateMany({
                where: { orderId: order.id, isCancelled: false },
                data: { status: dto.status, isCancelled: dto.status == OrderStatus.CANCELLED, updatedBy: updatedById ?? null },
            });

            // 2b. If cancelling, also cancel all related sub-menu items
            if (dto.status == OrderStatus.CANCELLED) {
                await this.prisma.orderSubMenuItem.updateMany({
                    where: {
                        orderItem: {
                            orderId: order.id,
                            isCancelled: true,
                        },
                    },
                    data: { isCancelled: true, updatedBy: updatedById ?? null },
                });
            }

            // 3. Log each item's transition (skip items already at target status)
            for (const item of currentItems) {
                if (item.status !== dto.status) {
                    await this.history.log({
                        orderId: order.id,
                        itemId: item.id,
                        fromStatus: item.status,
                        toStatus: dto.status,
                    });
                }
            }

            // 4. Recalculate subtotal/totalAmount (cancelled items excluded)
            await this.prisma.$transaction(async (tx) => {
                const recalculatedSubtotal = await this.itemService.recalculateSubtotal(tx, order.id);
                await tx.order.update({
                    where: { id: order.id },
                    data: {
                        subtotal: recalculatedSubtotal,
                        totalAmount: recalculatedSubtotal,
                        updatedBy: updatedById ?? null,
                    },
                });
            });

            // 5. Sync order-level status from items
            await this.syncOrderStatus(order.id);
        } else {
            // Only update the order-level status directly
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    status: dto.status,
                    updatedBy: updatedById ?? null,
                },
            });
        }

        // Log the order-level status transition
        await this.history.log({
            orderId: order.id,
            fromStatus: order.status,
            toStatus: dto.status,
            reason: dto.notes,
            changedBy: updatedById,
        });

        return {
            status: true,
            message: 'Order status updated successfully.',
        };
    }

    /**
     * Updates the status of a single order item.
     *
     * Validates that the item exists, is not cancelled, the role has permission,
     * and the status transition is valid. After updating, syncs the parent order's status.
     *
     * @param dto - The payload containing the order item ID and new status.
     * @param role - The role of the current user performing the update.
     * @returns An object with a success status and message.
     */
    public async updateOrderItemStatus(dto: UpdateOrderItemDto, role: Role, updatedById?: number) {
        const status = dto.status;

        const orderItem = await this.prisma.orderItem.findFirst({
            where: {
                orderItemId: dto.orderItemId,
            },
            select: {
                id: true,
                orderId: true,
                isCancelled: true,
                status: true,
            },
        });

        if (!orderItem) {
            throwBadRequestException('Order item not found.');
        }

        if (orderItem?.isCancelled) {
            throwBadRequestException(
                'Cannot update status of a cancelled order item.',
            );
        }

        this.validation.validateNotDirectlyCompleted(status);
        this.validation.validateRolePermission(role, status);
        this.validation.isValidStatusTransition(orderItem!.status, status);

        await this.prisma.orderItem.update({
            where: {
                id: orderItem!.id,
            },
            data: {
                status: dto.status,
                isCancelled: dto.status == OrderStatus.CANCELLED,
                updatedBy: updatedById ?? null,
            },
        });

        if (dto.status == OrderStatus.CANCELLED) {
            await this.prisma.orderSubMenuItem.updateMany({
                where: {
                    orderItemId: orderItem!.id,
                },
                data: {
                    isCancelled: true,
                    updatedBy: updatedById ?? null,
                },
            });
        }

        // Recalculate subtotal/totalAmount (cancelled items excluded)
        await this.prisma.$transaction(async (tx) => {
            const recalculatedSubtotal = await this.itemService.recalculateSubtotal(tx, orderItem!.orderId);
            await tx.order.update({
                where: { id: orderItem!.orderId },
                data: {
                    subtotal: recalculatedSubtotal,
                    totalAmount: recalculatedSubtotal,
                    updatedBy: updatedById ?? null,
                },
            });
        });

        await this.syncOrderStatus(orderItem!.orderId);

        // Log the item-level status transition
        await this.history.log({
            orderId: orderItem!.orderId,
            itemId: orderItem!.id,
            fromStatus: orderItem!.status,
            toStatus: status,
            changedBy: updatedById,
        });

        return {
            status: true,
            message: 'Order item status updated successfully.',
        };
    }

    // #endregion

    // #region Retrieval

    public async getActiveOrders(orderId?: string) {
        if (!orderId) {
            throwBadRequestException('Order not found.');
            return;
        }

        const orders = await this.prisma.order.findMany({
            where: {
                orderId,
                status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
            },
            select: this.orderSelect
        });

        if (!orders.length) {
            throwBadRequestException('Order not found.');
        }

        return {
            status: true,
            message: 'Orders fetched successfully.',
            data: this.transformOrders(orders),
        };
    }

    public async getTableWiseOrders(query: QueryOrderDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const skip = (page - 1) * limit;

        const where: Prisma.OrderWhereInput = {
            deletedAt: null,
            ...(query.search && {
                orderNumber: { contains: query.search },
            }),
        };

        const [orders, total] = await this.prisma.$transaction([
            this.prisma.order.findMany({
                where,
                select: {
                    ...this.orderSelect,
                    table: { select: { tableId: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.order.count({ where }),
        ]);

        const grouped = Object.values(
            orders.reduce((acc, { status, items, table, ...rest }) => {
                const tid = table?.tableId;
                if (!tid) return acc;

                acc[tid] = acc[tid] ?? { tableId: tid, tableName: table?.name, orders: [] };
                acc[tid].orders.push({
                    orderStatus: status,
                    tableId: tid,
                    ...rest,
                    items: this.transformOrderItems(items),
                });
                return acc;
            }, {} as Record<string, any>),
        );

        return {
            status: true,
            message: 'Orders fetched successfully.',
            data: grouped,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // #endregion

    // #region Remove All Orders
    public async cleanOrders() {
        await this.prisma.billing.deleteMany({});
        await this.prisma.orderStatusHistory.deleteMany({});
        await this.prisma.orderSubMenuItem.deleteMany({});
        await this.prisma.orderItem.deleteMany({});
        await this.prisma.order.deleteMany({});

        return {
            status: true,
            message: 'Orders cleaned successfully.',
        };
    }
    // #endregion

    // #region Status History

    /**
     * Retrieves the full status timeline for an order.
     * Ordered oldest-first for a chronological view.
     */
    public async getOrderStatusHistory(orderId: string) {
        // Verify order exists (by public UUID)
        const order = await this.prisma.order.findFirst({
            where: { orderId },
            select: { id: true },
        });

        if (!order) {
            throwNotFoundException(`Order with ID ${orderId} not found.`);
            return;
        }

        const history = await this.history.getHistoryForOrder(order.id);

        return {
            status: true,
            message: 'Order status history fetched successfully.',
            data: this.transformOrderHistory(history),
        };
    }

    // #endregion

    // #region Status Sync

    private async syncOrderStatus(orderId: number) {
        const items = await this.prisma.orderItem.findMany({
            where: { orderId, isCancelled: false },
            select: { status: true },
        });

        if (!items.length) return;

        const maxStatus = items.reduce<OrderStatus>((prev, curr) =>
            this.validation.statusPriority[curr.status] > this.validation.statusPriority[prev]
                ? curr.status
                : prev,
            OrderStatus.PENDING,
        );

        await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: maxStatus
            },
        });
    }

    // #endregion

    // #region Response Transformation

    private transformOrders(orders: any[]): any[] {
        return orders.map(({ orderId, status, items, table, ...rest }) => ({
            orderId,
            orderStatus: status,
            tableId: table?.tableId ?? null,
            ...rest,
            items: this.transformOrderItems(items),
        }));
    }

    private transformOrderItems(items: any[]): any[] {
        return items.map(({ orderItemId, status: orderItemStatus, menuItem, orderSubMenuItem, ...rest }) => ({
            orderItemId,
            orderItemStatus,
            ...rest,
            menuItem: menuItem && {
                menuItemId: menuItem.menuId,
                name: menuItem.name,
                price: menuItem.price,
                menuType: menuItem.menuType,
            },
            orderSubMenuItems: orderSubMenuItem?.map(
                ({ orderSubMenuItemId, subMenuItem, ...subRest }: any) => ({
                    orderSubMenuItemId,
                    ...subRest,
                    subMenuItem: subMenuItem && {
                        subMenuItemId: subMenuItem.subMenuId,
                        name: subMenuItem.name,
                        price: subMenuItem.price,
                    },
                }),
            ),
        }));
    }

    private transformOrderHistory(history: any[]): any[] {
        return history.map((h: any) => ({
            orderId: h.order?.orderId ?? null,
            fromStatus: h.fromStatus,
            toStatus: h.toStatus,
            changedBy: h.changedBy,
            reason: h.reason,
            metadata: h.metadata,
            createdAt: h.createdAt,
            item: h.item
                ? {
                      orderItemId: h.item.orderItemId,
                      menuItemId: h.item.menuItem?.menuId ?? null,
                      menuItemName: h.item.menuItem?.name ?? null,
                  }
                : null,
        }));
    }

    // #endregion
}