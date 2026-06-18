import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrderDto, CreateOrderItemDto, UpdateOrderItemDto } from './dto/order.dto';
import { OrderStatus, SessionStatus } from 'generated/prisma/enums';
import { throwBadRequestException, throwForbiddenException } from 'src/common/utils/http-exception.helper';
import { Prisma } from 'generated/prisma/client';
import { Role } from 'src/common/constants/constants';

// #region Types

/** Represents the data shape for creating an order sub-menu item within a transaction. */
type OrderSubMenuItemData = Prisma.OrderSubMenuItemUncheckedCreateWithoutOrderItemInput;

/** Represents the data shape for creating an order item within a transaction, with an optional metadata flag. */
type ItemsDataWithMeta = Prisma.OrderItemUncheckedCreateWithoutOrderInput & {
    /** Indicates whether this item was updated (used during order updates). */
    isUpdated?: boolean;
};

// #endregion

/**
 * Service responsible for order lifecycle management.
 *
 * Handles order creation, updates, status transitions, role-based permissions,
 * and retrieval of active/table-wise orders.
 */
@Injectable()
export class OrderService {
    constructor(private prisma: PrismaService) { }

    // #region Role Permissions

    /**
     * Maps each role to the set of order statuses they are allowed to set.
     * Used by {@link validateRolePermission} to enforce access control.
     */
    private readonly rolePermissions: Record<Role, OrderStatus[]> = {
        [Role.SUPER_ADMIN]: [
            OrderStatus.ACCEPTED,
            OrderStatus.COMPLETED,
        ],
        [Role.ADMIN]: [
            OrderStatus.ACCEPTED,
            OrderStatus.COMPLETED,
        ],
        [Role.CHEF]: [
            OrderStatus.PREPARING,
            OrderStatus.READY,
        ],
        [Role.WAITER]: [
            OrderStatus.SERVED,
            OrderStatus.CANCELLED,
            OrderStatus.COMPLETED,
        ],
        [Role.CUSTOMER]: [],
    };

    // #endregion

    // #region Query Selectors

    /**
     * Reusable Prisma select object for fetching orders with their items,
     * sub-menu items, and related menu item details.
     */
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
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        menuType: true,
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
                            select: {
                                id: true,
                                name: true,
                                price: true,
                            },
                        },
                    },
                },
            },
        },
    };

    // #endregion

    // #region Public Methods

    /**
     * Processes an order — creates a new order or updates an existing one for the given table session.
     *
     * Validates the active session, order items, and duplicates before running
     * a transactional create-or-update flow. On update, existing items and sub-menu items
     * are diffed against the incoming payload: removed items are soft-cancelled,
     * existing items are updated in place, and new items are created.
     *
     * @param dto - The order creation payload containing table ID, notes, and items.
     * @returns An object with a success status, message, and the order ID.
     */
    public async processOrder(dto: CreateOrderDto) {
        // Check active session
        let isUpdate: boolean = false;

        const existingSession = await this.prisma.tableSession.findFirst({
            where: {
                tableId: dto.tableId,
                status: SessionStatus.ACTIVE,
            },
        });

        if (!existingSession) {
            throwBadRequestException('Table active session not found.');
        }

        const sessionId = existingSession!.id;

        // Validate order items
        if (!dto.orderItems || dto.orderItems.length === 0) {
            throwBadRequestException('Order items are required.');
        }

        this.validateDuplicateOrderItems(dto.orderItems!);

        let orderId: number | null = null;

        await this.prisma.$transaction(async (tx) => {
            const checkOrderExists = await this.prisma.order.findFirst({
                where: {
                    sessionId: sessionId,
                },
            });

            isUpdate = !!checkOrderExists;
            const { subtotal, itemsData } = await this.prepareOrderItems(
                tx,
                dto.orderItems!,
                isUpdate
            );

            // If orders exists update the order
            if (checkOrderExists) {
                orderId = checkOrderExists.id;

                // Existing order items (include their submenu items)
                const existingItems = await tx.orderItem.findMany({
                    where: {
                        orderId,
                        isCancelled: false,
                    },
                    include: {
                        orderSubMenuItem: true,
                    },
                });

                // Incoming item keys (just menuItemId since submenu is nested)
                const incomingKeys = new Set(
                    dto.orderItems!.map(
                        (item) => `${item.menuItemId}`,
                    ),
                );

                // Group existing items
                const existingByMenuId = new Map<number, typeof existingItems[0]>();
                for (const item of existingItems) {
                    existingByMenuId.set(item.menuItemId!, item);
                }

                // Mark removed items (not in incoming) as cancelled
                const removedItemIds = existingItems
                    .filter((item) => !incomingKeys.has(`${item.menuItemId}`))
                    .map((item) => item.id);

                if (removedItemIds.length > 0) {
                    await tx.orderSubMenuItem.updateMany({
                        where: {
                            orderItemId: {
                                in: removedItemIds,
                            },
                        },
                        data: {
                            isCancelled: true,
                        },
                    });

                    await tx.orderItem.updateMany({
                        where: {
                            id: {
                                in: removedItemIds,
                            },
                        },
                        data: {
                            isCancelled: true,
                        },
                    });
                }

                // Process incoming items: update existing or create new
                for (const incomingItem of dto.orderItems!) {
                    const existingItem = existingByMenuId.get(incomingItem.menuItemId);

                    if (existingItem) {
                        // Item exists - update it in place instead of delete+recreate
                        const incomingSubMenuIds = new Set(
                            (incomingItem.orderSubMenuItems || []).map((s) => s.subMenuItemId),
                        );

                        // Map existing active submenu items by subMenuItemId for quick lookup
                        const existingActiveSubMenuItems = existingItem.orderSubMenuItem
                            .filter((s) => !s.isCancelled);

                        // Mark removed submenu items as cancelled
                        const removedSubMenuItemIds = existingActiveSubMenuItems
                            .filter((s) => !incomingSubMenuIds.has(s.subMenuItemId!))
                            .map((s) => s.id);

                        if (removedSubMenuItemIds.length > 0) {
                            await tx.orderSubMenuItem.updateMany({
                                where: {
                                    id: {
                                        in: removedSubMenuItemIds,
                                    },
                                },
                                data: {
                                    isCancelled: true,
                                },
                            });
                        }

                        // Collect all subMenuItemIds needed for this item (both new and existing)
                        const allNeededSubMenuItemIds = (incomingItem.orderSubMenuItems || []).map((s) => s.subMenuItemId);
                        const subMenuItemPrices = new Map<number, any>();

                        if (allNeededSubMenuItemIds.length > 0) {
                            const subMenuItemData = await tx.subMenuItem.findMany({
                                where: {
                                    id: {
                                        in: allNeededSubMenuItemIds,
                                    },
                                },
                            });
                            for (const sub of subMenuItemData) {
                                subMenuItemPrices.set(sub.id, sub);
                            }
                        }

                        // Process each incoming submenu item
                        for (const incomingSub of (incomingItem.orderSubMenuItems || [])) {
                            const existingSub = existingActiveSubMenuItems.find(
                                (s) => s.subMenuItemId === incomingSub.subMenuItemId,
                            );

                            if (existingSub) {
                                // Existing submenu item - update quantity, price, and notes
                                const subMenuItem = subMenuItemPrices.get(incomingSub.subMenuItemId);
                                const subItemTotal = subMenuItem
                                    ? subMenuItem.price.mul(incomingSub.quantity)
                                    : existingSub.totalPrice;

                                await tx.orderSubMenuItem.update({
                                    where: { id: existingSub.id },
                                    data: {
                                        quantity: incomingSub.quantity,
                                        totalPrice: subItemTotal,
                                        notes: incomingSub.notes,
                                    },
                                });
                            } else {
                                // New submenu item - create it
                                const subMenuItem = subMenuItemPrices.get(incomingSub.subMenuItemId);
                                if (subMenuItem) {
                                    const subItemTotal = subMenuItem.price.mul(incomingSub.quantity);
                                    await tx.orderSubMenuItem.create({
                                        data: {
                                            orderItemId: existingItem.id,
                                            subMenuItemId: incomingSub.subMenuItemId,
                                            quantity: incomingSub.quantity,
                                            unitPrice: subMenuItem.price,
                                            totalPrice: subItemTotal,
                                            notes: incomingSub.notes,
                                        },
                                    });
                                }
                            }
                        }

                        // Find the prepared itemsData for this menuItem to get prices
                        const itemData = itemsData.find((d) => d.menuItemId === incomingItem.menuItemId);

                        // Update existing order item's pricing
                        await tx.orderItem.update({
                            where: { id: existingItem.id },
                            data: {
                                quantity: incomingItem.quantity,
                                totalPrice: itemData?.totalPrice ?? existingItem.totalPrice,
                                notes: incomingItem.notes,
                                ...(incomingItem.isUpdated && { status: OrderStatus.PENDING }),
                            },
                        });
                    } else {
                        // New item - create with nested submenu items
                        const itemData = itemsData.find((d) => d.menuItemId === incomingItem.menuItemId);
                        if (itemData) {
                            const { isUpdated, ...createData } = itemData;
                            const { orderSubMenuItem, ...rest } = createData as any;

                            await tx.orderItem.create({
                                data: {
                                    ...rest,
                                    orderId: orderId!,
                                    orderSubMenuItem: orderSubMenuItem || undefined,
                                },
                            });
                        }
                    }
                }

                // Recalculate subtotal from scratch for accuracy
                const allActiveItems = await tx.orderItem.findMany({
                    where: {
                        orderId,
                        isCancelled: false,
                    },
                    include: {
                        orderSubMenuItem: {
                            where: {
                                isCancelled: false,
                            },
                        },
                    },
                });

                let recalculatedSubtotal = new Prisma.Decimal(0);
                for (const item of allActiveItems) {
                    recalculatedSubtotal = recalculatedSubtotal.add(item.totalPrice);
                    for (const sub of item.orderSubMenuItem) {
                        recalculatedSubtotal = recalculatedSubtotal.add(sub.totalPrice);
                    }
                }

                await tx.order.update({
                    where: {
                        id: orderId,
                    },
                    data: {
                        notes: dto.notes,
                        subtotal: recalculatedSubtotal,
                        totalAmount: recalculatedSubtotal,
                    },
                });
            }
            // Else create order
            else {
                const createdOrder = await tx.order.create({
                    data: {
                        orderNumber: `ORD-${Date.now()}`,
                        tableId: dto.tableId,
                        sessionId,
                        subtotal,
                        totalAmount: subtotal,
                        notes: dto.notes,
                        items: {
                            create: itemsData,
                        },
                    },
                });

                orderId = createdOrder.id;
            }
        });

        if (isUpdate) {
            // Sync the order-level status based on the items' statuses
            await this.syncOrderStatus(orderId!);
        }

        return {
            status: true,
            message: 'Order Placed Successfully',
            orderId,
        };
    }

    /**
     * Retrieves active (non-completed, non-cancelled) orders.
     *
     * If an `orderId` is provided, fetches only that specific order;
     * otherwise returns all active orders.
     *
     * @param orderId - Optional order ID to filter by.
     * @returns An object with a success status, message, and the transformed order data.
     */
    public async getActiveOrders(orderId?: number) {
        const orders = await this.prisma.order.findMany({
            where: {
                id: orderId,
                status: {
                    notIn: [
                        OrderStatus.COMPLETED,
                        OrderStatus.CANCELLED,
                    ],
                },
            },
            select: this.orderSelect,
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (!orders.length) {
            throwBadRequestException('Order not found.');
        }

        return {
            status: true,
            message: 'Orders fetched successfully',
            data: this.transformOrdersResponse(orders),
        };
    }

    /**
     * Retrieves active orders grouped by table.
     *
     * Each table entry contains its orders with transformed item data.
     *
     * @returns An object with a success status, message, and an array of table-wise order groups.
     */
    public async getTableWiseOrders() {
        const orders = await this.prisma.order.findMany({
            where: {
                status: {
                    notIn: [
                        OrderStatus.COMPLETED,
                        OrderStatus.CANCELLED,
                    ],
                },
            },
            select: {
                ...this.orderSelect,
                table: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const data = Object.values(
            orders.reduce((acc, { id, status, items, table, ...order }) => {
                const tableId = table?.id;

                if (!acc[tableId]) {
                    acc[tableId] = {
                        tableId,
                        tableName: table?.name,
                        orders: [],
                    };
                }

                acc[tableId].orders.push({
                    orderId: id,
                    orderStatus: status,
                    ...order,
                    items: this.transformOrderItems(items),
                });

                return acc;
            }, {} as Record<number, any>),
        );

        return {
            status: true,
            message: 'Orders fetched successfully',
            data,
        };
    }

    /**
     * Deletes all orders, order items, and sub-menu items from the database.
     *
     * **Warning:** This is a destructive operation intended for development/cleanup purposes.
     *
     * @returns An object with a success status and message.
     */
    public async cleanOrders() {
        // Delete all order items and submenuitems first
        await this.prisma.orderSubMenuItem.deleteMany({});
        await this.prisma.orderItem.deleteMany({});

        // Delete all orders
        await this.prisma.order.deleteMany({});

        return {
            status: true,
            message: 'Order and OrderItem tables cleaned successfully',
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

        this.validateRolePermission(role, status);
        this.isValidStatusTransition(orderItem!.status, status);

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

    /**
     * Updates the status of an entire order and all its non-cancelled items.
     *
     * Validates role permissions and status transitions before applying the update.
     * After updating all items, syncs the order-level status.
     *
     * @param orderId - The ID of the order to update.
     * @param status - The new status to apply.
     * @param role - The role of the current user performing the update.
     * @returns An object with a success status and message.
     */
    public async updateOrderStatus(orderId: number, status: OrderStatus, role: Role) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, status: true },
        });

        if (!order) {
            throwBadRequestException('Order not found.');
        }

        this.validateRolePermission(role, status);
        this.isValidStatusTransition(order!.status, status);

        // Update all non-cancelled order items to the requested status
        await this.prisma.orderItem.updateMany({
            where: {
                orderId,
                isCancelled: false,
            },
            data: {
                status,
            },
        });

        // Sync the order-level status based on the items' statuses
        await this.syncOrderStatus(orderId);

        return {
            status: true,
            message: 'Order status updated successfully.',
        };
    }

    // #endregion

    // #region Validation & Permissions

    /**
     * Validates that the given role is permitted to set the specified order status.
     *
     * @param role - The user's role.
     * @param status - The target order status.
     * @throws ForbiddenException if the role lacks permission.
     */
    private validateRolePermission(role: Role, status: OrderStatus): void {
        const allowedStatuses = this.rolePermissions[role];

        if (!allowedStatuses || !allowedStatuses.includes(status)) {
            throwForbiddenException(
                `Role ${role} does not have permission to set status to ${status}.`,
            );
        }
    }

    /**
     * Validates that the transition from the current status to the new status is allowed.
     *
     * Defines a state machine for order status transitions:
     * - PENDING    → ACCEPTED, CANCELLED
     * - ACCEPTED   → PREPARING, CANCELLED
     * - PREPARING  → READY, CANCELLED
     * - READY      → SERVED, CANCELLED
     * - SERVED     → COMPLETED, CANCELLED
     * - COMPLETED  → (terminal)
     * - CANCELLED  → (terminal)
     *
     * @param currentStatus - The current order status.
     * @param newStatus - The desired new status.
     * @throws BadRequestException if the transition is not allowed.
     */
    private isValidStatusTransition(
        currentStatus: OrderStatus,
        newStatus: OrderStatus,
    ): void {
        // Define allowed transitions
        const transitions: Record<OrderStatus, OrderStatus[]> = {
            [OrderStatus.PENDING]: [
                OrderStatus.ACCEPTED,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.ACCEPTED]: [
                OrderStatus.PREPARING,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.PREPARING]: [
                OrderStatus.READY,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.READY]: [
                OrderStatus.SERVED,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.SERVED]: [
                OrderStatus.COMPLETED,
                OrderStatus.CANCELLED,
            ],
            [OrderStatus.COMPLETED]: [],
            [OrderStatus.CANCELLED]: [],
        };

        const validTransition = transitions[currentStatus]?.includes(newStatus) ?? false;
        if (!validTransition) {
            throwBadRequestException(
                `Cannot transition order status from ${currentStatus} to ${newStatus}.`,
            );
        }
    }

    /**
     * Checks for duplicate menu item IDs in the order items array.
     *
     * Each menu item can only appear once per order; duplicates are rejected.
     *
     * @param orderItems - The array of order items to validate.
     * @throws BadRequestException if a duplicate menu item ID is found.
     */
    private validateDuplicateOrderItems(orderItems: CreateOrderItemDto[]): void {
        const itemKeys = new Set<string>();

        for (const item of orderItems) {
            const key = `${item.menuItemId}`;

            if (itemKeys.has(key)) {
                throwBadRequestException(
                    `Duplicate item found. MenuItemId ${item.menuItemId} cannot be added multiple times.`,
                );
            }

            itemKeys.add(key);
        }
    }

    // #endregion

    // #region Status Synchronization

    /**
     * Synchronises the order-level status based on the highest-priority status
     * among its non-cancelled items.
     *
     * Priority order (ascending): PENDING → ACCEPTED → PREPARING → READY → SERVED → COMPLETED.
     * CANCELLED items are excluded from the calculation.
     *
     * If the resulting status is COMPLETED, the order's `completedAt` timestamp is also set.
     *
     * @param orderId - The ID of the order to synchronise.
     */
    private async syncOrderStatus(orderId: number) {
        const orderItems = await this.prisma.orderItem.findMany({
            where: { orderId, isCancelled: false },
            select: { status: true },
        });

        if (!orderItems.length) return;

        const statusPriority: Record<OrderStatus, number> = {
            [OrderStatus.PENDING]: 0,
            [OrderStatus.ACCEPTED]: 1,
            [OrderStatus.PREPARING]: 2,
            [OrderStatus.READY]: 3,
            [OrderStatus.SERVED]: 4,
            [OrderStatus.COMPLETED]: 5,
            [OrderStatus.CANCELLED]: -1,
        };

        // Find max priority among items
        const maxStatus = orderItems.reduce<OrderStatus>((prev, curr) => {
            return statusPriority[curr.status] > statusPriority[prev] ? curr.status : prev;
        }, OrderStatus.PENDING);

        await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: maxStatus,
                ...(maxStatus === OrderStatus.COMPLETED && { completedAt: new Date() }),
            },
        });
    }

    // #endregion

    // #region Order Item Preparation

    /**
     * Prepares order item data for creation within a transaction.
     *
     * Fetches menu items and sub-menu items, validates availability and quantities,
     * calculates pricing, and returns the computed subtotal along with structured
     * item data ready for Prisma create operations.
     *
     * @param tx - The Prisma transaction client.
     * @param items - The array of incoming order items.
     * @param includeUpdatedFlag - Whether to include the `isUpdated` metadata flag on each item.
     * @returns An object containing the computed `subtotal` and `itemsData` array.
     */
    private async prepareOrderItems(tx: Prisma.TransactionClient, items: CreateOrderItemDto[], includeUpdatedFlag: boolean) {
        const menuIds = [...new Set(items.map((i) => i.menuItemId))];

        const menuItems = await tx.menuItem.findMany({
            where: {
                id: {
                    in: menuIds,
                },
            },
        });

        const menuMap = new Map(
            menuItems.map((menu) => [menu.id, menu]),
        );

        // Collect all subMenuItemIds from all items
        const subMenuItemIds = [
            ...new Set(
                items
                    .flatMap((item) => item.orderSubMenuItems || [])
                    .map((subItem) => subItem.subMenuItemId),
            ),
        ];

        let subMenuMap = new Map<number, any>();
        if (subMenuItemIds.length > 0) {
            const subMenuItems = await tx.subMenuItem.findMany({
                where: {
                    id: {
                        in: subMenuItemIds,
                    },
                },
            });
            subMenuMap = new Map(
                subMenuItems.map((sub) => [sub.id, sub]),
            );
        }

        let subtotal = new Prisma.Decimal(0);

        const itemsData: ItemsDataWithMeta[] = [];

        for (const item of items) {
            const menuItem = menuMap.get(item.menuItemId);

            if (!menuItem) {
                throwBadRequestException(
                    `Menu item not found: ${item.menuItemId}`,
                );
            }

            if (!menuItem!.available) {
                throwBadRequestException(
                    `Menu item unavailable: ${menuItem!.name}`,
                );
            }

            if (item.quantity <= 0) {
                throwBadRequestException(
                    `Invalid quantity for menu item: ${item.menuItemId}`,
                );
            }

            // Calculate menu item total
            const itemTotal = menuItem!.price.mul(item.quantity);
            subtotal = subtotal.add(itemTotal);

            // Process orderSubMenuItems
            const orderSubMenuItemsData: OrderSubMenuItemData[] = [];
            if (item.orderSubMenuItems && item.orderSubMenuItems.length > 0) {
                for (const subItem of item.orderSubMenuItems) {
                    const subMenuItem = subMenuMap.get(subItem.subMenuItemId);

                    if (!subMenuItem) {
                        throwBadRequestException(
                            `Sub menu item not found: ${subItem.subMenuItemId}`,
                        );
                    }

                    if (!subMenuItem?.available) {
                        throwBadRequestException(
                            `Sub menu item unavailable: ${subMenuItem?.name}`,
                        );
                    }

                    if (subItem.quantity <= 0) {
                        throwBadRequestException(
                            `Invalid quantity for sub menu item: ${subItem.subMenuItemId}`,
                        );
                    }

                    const subItemTotal = subMenuItem.price.mul(subItem.quantity);
                    subtotal = subtotal.add(subItemTotal);

                    orderSubMenuItemsData.push({
                        subMenuItemId: subItem.subMenuItemId,
                        quantity: subItem.quantity,
                        unitPrice: subMenuItem.price,
                        totalPrice: subItemTotal,
                        notes: subItem.notes,
                    });
                }
            }

            // Build the item data with nested orderSubMenuItem create
            const itemData: ItemsDataWithMeta = {
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPrice: menuItem?.price ?? 0,
                totalPrice: itemTotal,
                notes: item.notes,
                ...(includeUpdatedFlag && { isUpdated: item.isUpdated }),
            };

            if (orderSubMenuItemsData.length > 0) {
                (itemData as any).orderSubMenuItem = {
                    create: orderSubMenuItemsData,
                };
            }

            itemsData.push(itemData);
        }

        return {
            subtotal,
            itemsData,
        };
    }

    // #endregion

    // #region Response Transformation

    /**
     * Transforms raw order records into a flattened response format.
     *
     * Renames `id` → `orderId` and `status` → `orderStatus`, and transforms
     * nested items via {@link transformOrderItems}.
     *
     * @param orders - The raw order records from Prisma.
     * @returns The transformed order array.
     */
    private transformOrdersResponse(orders: any[]): any[] {
        return orders.map(({ id, status, items, ...order }) => ({
            orderId: id,
            orderStatus: status,
            ...order,
            items: this.transformOrderItems(items),
        }));
    }

    /**
     * Transforms raw order item records into a flattened response format.
     *
     * Renames `id` → `orderItemId`, `status` → `orderItemStatus`, flattens
     * the nested `menuItem` and `orderSubMenuItem` relations.
     *
     * @param items - The raw order item records from Prisma.
     * @returns The transformed order item array.
     */
    private transformOrderItems(items: any[]): any[] {
        return items.map(({ id: orderItemId, status: orderItemStatus, menuItem, orderSubMenuItem, ...rest }) => ({
            orderItemId,
            orderItemStatus,
            ...rest,
            menuItem: menuItem && {
                menuItemId: menuItem.id,
                ...menuItem,
            },
            orderSubMenuItems: orderSubMenuItem?.map(({ id: orderSubMenuItemId, subMenuItem, ...subRest }) => ({
                orderSubMenuItemId,
                ...subRest,
                subMenuItem: subMenuItem && {
                    subMenuItemId: subMenuItem.id,
                    ...subMenuItem,
                },
            })),
        }));
    }

    // #endregion
}