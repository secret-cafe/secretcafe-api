import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwForbiddenException } from 'src/common/utils/http-exception.helper';
import { OrderStatus } from 'generated/prisma/enums';
import { Prisma } from 'generated/prisma/client';
import { Role } from 'src/common/constants/constants';
import { ProcessOrderItemDto } from './dto/order.dto';

export interface MenuItemInfo {
    id: number;
    menuId: string;
    price: Prisma.Decimal;
    name: string;
    available: boolean;
}

export interface SubMenuItemInfo {
    id: number;
    subMenuId: string;
    price: Prisma.Decimal;
    name: string;
    available: boolean;
}

@Injectable()
export class OrderValidationService {
    constructor(private readonly prisma: PrismaService) { }

    // #region Role Permissions (Single Source of Truth)

    private readonly rolePermissions: Record<Role, OrderStatus[]> = {
        [Role.SUPER_ADMIN]: [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED, OrderStatus.CANCELLED, OrderStatus.COMPLETED],
        [Role.ADMIN]: [OrderStatus.ACCEPTED, OrderStatus.COMPLETED],
        [Role.CHEF]: [OrderStatus.PREPARING, OrderStatus.READY],
        [Role.WAITER]: [OrderStatus.SERVED, OrderStatus.CANCELLED, OrderStatus.COMPLETED],
        [Role.CUSTOMER]: [],
    };

    /** Allowed state-machine transitions for order-item statuses. */
    private readonly statusTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
        [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
        [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
        [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
        [OrderStatus.SERVED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        [OrderStatus.COMPLETED]: [],
        [OrderStatus.CANCELLED]: [],
    };

    /** Numeric priority for statuses — used to sync order-level status. */
    readonly statusPriority: Record<OrderStatus, number> = {
        [OrderStatus.PENDING]: 0,
        [OrderStatus.ACCEPTED]: 1,
        [OrderStatus.PREPARING]: 2,
        [OrderStatus.READY]: 3,
        [OrderStatus.SERVED]: 4,
        [OrderStatus.COMPLETED]: 5,
        [OrderStatus.CANCELLED]: -1,
    };

    // #endregion

    // #region Role & Status Validation

    /** Throws if the given role is not allowed to set the given status. */
    validateRolePermission(role: Role, status: OrderStatus): void {
        const allowed = this.rolePermissions[role];
        if (!allowed?.includes(status)) {
            throwForbiddenException(
                `Role ${role} does not have permission to set status to ${status}.`,
            );
        }
    }

    /** Throws if the status transition is invalid. */
    isValidStatusTransition(current: OrderStatus, next: OrderStatus): void {
        const valid = this.statusTransitions[current]?.includes(next) ?? false;
        if (!valid) {
            throwBadRequestException(
                `Cannot transition from ${current} to ${next}.`,
            );
        }
    }

    /**
     * Throws if the target status is COMPLETED — must go through billing flow.
     *
     * Setting an order or item to COMPLETED is only allowed via the billing/payment
     * process, not through direct status update endpoints.
     */
    validateNotDirectlyCompleted(status: OrderStatus): void {
        if (status === OrderStatus.COMPLETED) {
            throwBadRequestException(
                'Cannot set status to COMPLETED directly. Complete the billing/payment flow instead.',
            );
        }
    }

    // #endregion

    // #region Duplicate Detection

    /** Throws if any menuItemId appears more than once in the payload. */
    validateNoDuplicates(items: { menuItemId: string }[]): void {
        const seen = new Set<string>();
        for (const item of items) {
            if (seen.has(item.menuItemId)) {
                throwBadRequestException(
                    `Duplicate item found. MenuItemId ${item.menuItemId} cannot be added multiple times.`,
                );
            }
            seen.add(item.menuItemId);
        }
    }

    /**
     * Validates that incoming items don't conflict with existing non-cancelled items
     * in the order by `menuItemId`.
     *
     * **Rules:**
     * - Incoming item with `orderItemId` = updating an existing row — allowed IF the
     *   `menuItemId` matches the same row (no other non-cancelled item owns it).
     * - Incoming item without `orderItemId` = new item — rejected if `menuItemId`
     *   already exists as a non-cancelled item.
     * - Cancelled items in the DB are ignored (they can be re-added).
     */
    async validateNoDuplicatesWithExisting(
        tx: Prisma.TransactionClient,
        orderId: number,
        items: ProcessOrderItemDto[],
    ): Promise<void> {
        // Fetch all non-cancelled items currently in the order
        const existingItems = await tx.orderItem.findMany({
            where: { orderId, isCancelled: false },
            select: {
                id: true,
                orderItemId: true,
                menuItem: { select: { menuId: true } },
            },
        });

        // Map menuId (public UUID) → orderItemId (public UUID) for existing non-cancelled items
        const existingMenuMap = new Map(
            existingItems
                .filter((e) => e.menuItem?.menuId)
                .map((e) => [e.menuItem!.menuId, e.orderItemId]),
        );

        for (const incoming of items) {
            const existingItemId = existingMenuMap.get(incoming.menuItemId);

            if (existingItemId === undefined) {
                // menuItemId is not in the order yet — always allowed
                continue;
            }

            if (incoming.orderItemId !== undefined) {
                // This is an update/cancel of an existing item
                // Allowed only if the existingItemId matches the incoming one
                if (incoming.orderItemId !== existingItemId) {
                    throwBadRequestException(
                        `MenuItemId ${incoming.menuItemId} is already assigned to order item #${existingItemId}. ` +
                        `Cannot add it as a separate item.`,
                    );
                }
            } else {
                // This is a new item — but menuItemId already exists in the order
                throwBadRequestException(
                    `MenuItemId ${incoming.menuItemId} is already part of this order (item #${existingItemId}).`,
                );
            }
        }
    }

    // #endregion

    // #region Menu & Sub-Menu Lookup

    /**
     * Batch-fetches menu items by public `menuId` (UUID) and returns a
     * price/availability map keyed by that UUID.
     * Throws if any menu item is missing or unavailable.
     */
    async resolveMenuItems(ids: string[]): Promise<Map<string, MenuItemInfo>> {
        const items = await this.prisma.menuItem.findMany({
            where: { menuId: { in: [...new Set(ids)] } },
            select: { id: true, menuId: true, price: true, name: true, available: true },
        });

        const map = new Map(
            items.map((m) => [m.menuId!, m] as [string, MenuItemInfo]),
        );

        for (const id of ids) {
            const item = map.get(id);
            if (!item) {
                throwBadRequestException(`Menu item not found: ${id}`);
            }
            if (!item!.available) {
                throwBadRequestException(`Menu item unavailable: ${item!.name}`);
            }
        }

        return map;
    }

    /**
     * Batch-fetches sub-menu items by public `subMenuId` (UUID) and returns a
     * price/availability map keyed by that UUID.
     * Throws if any sub-menu item is missing or unavailable.
     */
    async resolveSubMenuItems(ids: string[]): Promise<Map<string, SubMenuItemInfo>> {
        if (ids.length === 0) return new Map();

        const items = await this.prisma.subMenuItem.findMany({
            where: { subMenuId: { in: [...new Set(ids)] } },
            select: { id: true, subMenuId: true, price: true, name: true, available: true },
        });

        const map = new Map(
            items.map((s) => [s.subMenuId!, s] as [string, SubMenuItemInfo]),
        );

        for (const id of ids) {
            const item = map.get(id);
            if (!item) {
                throwBadRequestException(`Sub menu item not found: ${id}`);
            }
            if (!item!.available) {
                throwBadRequestException(`Sub menu item unavailable: ${item!.name}`);
            }
        }

        return map;
    }

    // #endregion
}