import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrderValidationService } from './order-validation.service';
import { OrderItemService } from './order-item.service';
import { ProcessOrderDto, UpdateOrderItemDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrderStatus, SessionStatus } from 'generated/prisma/enums';
import { throwBadRequestException } from 'src/common/utils/http-exception.helper';
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
    ) { }

    // #region Query Selectors (Single Source of Truth)

    private readonly orderSelect = {
        id: true,
        tableId: true,
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
                id: true,
                orderId: true,
                status: true,
                quantity: true,
                unitPrice: true,
                totalPrice: true,
                notes: true,
                isCancelled: true,
                menuItem: {
                    select: { id: true, name: true, price: true, menuType: true },
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
                            select: { id: true, name: true, price: true },
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
     */
    public async processOrder(dto: ProcessOrderDto) {
        // 1. Validate session
        const session = await this.prisma.tableSession.findFirst({
            where: { tableId: dto.tableId, status: SessionStatus.ACTIVE },
        });

        if (!session) {
            throwBadRequestException('Table active session not found.');
            return;
        }

        if (!dto.orderItems?.length) {
            throwBadRequestException('Order items are required.');
            return;
        }

        let orderId: number;
        let isNew = false;

        // 2. Execute within a single transaction
        await this.prisma.$transaction(async (tx) => {
            // Look up existing order by session (no orderId from client needed)
            const existing = await tx.order.findFirst({
                where: { sessionId: session.id },
                select: { id: true, status: true },
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
                );

                await tx.order.update({
                    where: { id: existing.id },
                    data: {
                        notes: dto.notes ?? undefined,
                        subtotal: recalculatedSubtotal,
                        totalAmount: recalculatedSubtotal,
                    },
                });

                orderId = existing.id;
            }
            // === CREATE FLOW ===
            else {
                const { subtotal, itemsData } = await this.itemService.prepareNewItems(
                    tx,
                    dto.orderItems,
                );

                const created = await tx.order.create({
                    data: {
                        orderNumber: `ORD-${Date.now()}`,
                        tableId: dto.tableId,
                        sessionId: session.id,
                        subtotal,
                        totalAmount: subtotal,
                        notes: dto.notes,
                        items: { create: itemsData },
                    },
                });

                orderId = created.id;
                isNew = true;
            }
        });

        // 3. Sync order-level status (outside transaction for simplicity)
        await this.syncOrderStatus(orderId!);

        return {
            status: true,
            message: isNew ? 'Order placed successfully.' : 'Order updated successfully.',
            orderId: orderId!,
        };
    }

    // #endregion

    // #region Status Updates

    /**
     * Updates the status of an entire order and all its non-cancelled items.
     */
    public async updateOrderStatus(dto: UpdateOrderStatusDto, role: Role) {
        const order = await this.prisma.order.findUnique({
            where: { id: dto.orderId },
            select: { id: true, status: true },
        });

        if (!order) {
            throwBadRequestException('Order not found.');
            return;
        }

        this.validation.validateRolePermission(role, dto.status);
        this.validation.isValidStatusTransition(order.status, dto.status);

        await this.prisma.orderItem.updateMany({
            where: { orderId: dto.orderId, isCancelled: false },
            data: { status: dto.status },
        });

        await this.syncOrderStatus(dto.orderId);

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
    public async updateOrderItemStatus(dto: UpdateOrderItemDto, role: Role) {
        const orderItemId = dto.orderItemId;
        const status = dto.status;

        const orderItem = await this.prisma.orderItem.findUnique({
            where: {
                id: orderItemId,
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

        this.validation.validateRolePermission(role, status);
        this.validation.isValidStatusTransition(orderItem!.status, status);

        await this.prisma.orderItem.update({
            where: {
                id: orderItemId,
            },
            data: {
                status,
            },
        });

        await this.syncOrderStatus(orderItem!.orderId);

        return {
            status: true,
            message: 'Order item status updated successfully.',
        };
    }

    // #endregion

    // #region Retrieval

    public async getActiveOrders(orderId?: number) {
        const orders = await this.prisma.order.findMany({
            where: {
                id: orderId,
                status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
            },
            select: this.orderSelect,
            orderBy: { createdAt: 'desc' },
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

    public async getTableWiseOrders() {
        const orders = await this.prisma.order.findMany({
            where: {
                status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
            },
            select: {
                ...this.orderSelect,
                table: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const grouped = Object.values(
            orders.reduce((acc, { id, status, items, table, ...rest }) => {
                const tid = table?.id;
                if (!acc[tid]) {
                    acc[tid] = { tableId: tid, tableName: table?.name, orders: [] };
                }
                acc[tid].orders.push({
                    orderId: id,
                    orderStatus: status,
                    ...rest,
                    items: this.transformOrderItems(items),
                });
                return acc;
            }, {} as Record<number, any>),
        );

        return {
            status: true,
            message: 'Orders fetched successfully.',
            data: grouped,
        };
    }

    public async cleanOrders() {
        await this.prisma.orderSubMenuItem.deleteMany({});
        await this.prisma.orderItem.deleteMany({});
        await this.prisma.order.deleteMany({});

        return {
            status: true,
            message: 'Orders cleaned successfully.',
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
                status: maxStatus,
                ...(maxStatus === OrderStatus.COMPLETED && { completedAt: new Date() }),
            },
        });
    }

    // #endregion

    // #region Response Transformation

    private transformOrders(orders: any[]): any[] {
        return orders.map(({ id, status, items, ...rest }) => ({
            orderId: id,
            orderStatus: status,
            ...rest,
            items: this.transformOrderItems(items),
        }));
    }

    private transformOrderItems(items: any[]): any[] {
        return items.map(({ id: orderItemId, status: orderItemStatus, menuItem, orderSubMenuItem, ...rest }) => ({
            orderItemId,
            orderItemStatus,
            ...rest,
            menuItem: menuItem && { menuItemId: menuItem.id, ...menuItem },
            orderSubMenuItems: orderSubMenuItem?.map(
                ({ id: orderSubMenuItemId, subMenuItem, ...subRest }: any) => ({
                    orderSubMenuItemId,
                    ...subRest,
                    subMenuItem: subMenuItem && { subMenuItemId: subMenuItem.id, ...subMenuItem },
                }),
            ),
        }));
    }

    // #endregion
}