import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwForbiddenException } from 'src/common/utils/http-exception.helper';
import { OrderStatus } from 'generated/prisma/enums';
import { Prisma } from 'generated/prisma/client';
import { Role } from 'src/common/constants/constants';

export interface MenuItemInfo {
    id: number;
    price: Prisma.Decimal;
    name: string;
    available: boolean;
}

export interface SubMenuItemInfo {
    id: number;
    price: Prisma.Decimal;
    name: string;
    available: boolean;
}

@Injectable()
export class OrderValidationService {
    constructor(private readonly prisma: PrismaService) { }

    // #region Role Permissions (Single Source of Truth)

    private readonly rolePermissions: Record<Role, OrderStatus[]> = {
        [Role.SUPER_ADMIN]: [OrderStatus.ACCEPTED, OrderStatus.COMPLETED],
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

    // #endregion

    // #region Duplicate Detection

    /** Throws if any menuItemId appears more than once in the payload. */
    validateNoDuplicates(items: { menuItemId: number }[]): void {
        const seen = new Set<number>();
        for (const item of items) {
            if (seen.has(item.menuItemId)) {
                throwBadRequestException(
                    `Duplicate item found. MenuItemId ${item.menuItemId} cannot be added multiple times.`,
                );
            }
            seen.add(item.menuItemId);
        }
    }

    // #endregion

    // #region Menu & Sub-Menu Lookup

    /**
     * Batch-fetches menu items and returns a price/availability map.
     * Throws if any menu item is missing or unavailable.
     */
    async resolveMenuItems(ids: number[]): Promise<Map<number, MenuItemInfo>> {
        const items = await this.prisma.menuItem.findMany({
            where: { id: { in: [...new Set(ids)] } },
            select: { id: true, price: true, name: true, available: true },
        });

        const map = new Map(items.map((m) => [m.id, m]));

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
     * Batch-fetches sub-menu items and returns a price/availability map.
     * Throws if any sub-menu item is missing or unavailable.
     */
    async resolveSubMenuItems(ids: number[]): Promise<Map<number, SubMenuItemInfo>> {
        if (ids.length === 0) return new Map();

        const items = await this.prisma.subMenuItem.findMany({
            where: { id: { in: [...new Set(ids)] } },
            select: { id: true, price: true, name: true, available: true },
        });

        const map = new Map(items.map((s) => [s.id, s]));

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