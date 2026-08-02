import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { OrderStatus } from 'generated/prisma/enums';
import { OrderValidationService } from './order-validation.service';
import { ProcessOrderItemDto, ProcessOrderSubMenuItemDto } from './dto/order.dto';
import { throwBadRequestException } from 'src/common/utils/http-exception.helper';

/** Data shape for creating a sub-menu item within a transaction. */
type SubMenuData = Prisma.OrderSubMenuItemUncheckedCreateWithoutOrderItemInput;

/** Data shape for creating an order item within a transaction. */
type ItemData = Prisma.OrderItemUncheckedCreateWithoutOrderInput;

export interface PreparedItemsResult {
    subtotal: Prisma.Decimal;
    itemsData: ItemData[];
}

@Injectable()
export class OrderItemService {
    constructor(private readonly validation: OrderValidationService) { }

    // #region Public API

    /**
     * Prepares item payloads for a **new** order (all items are new).
     */
    async prepareNewItems(tx: Prisma.TransactionClient, items: ProcessOrderItemDto[]): Promise<PreparedItemsResult> {
        this.validation.validateNoDuplicates(items);

        const menuIds = items.map((i) => i.menuItemId);
        const menuMap = await this.validation.resolveMenuItems(menuIds);

        const allSubIds = [
            ...new Set(items.flatMap((i) => (i.orderSubMenuItems || []).map((s) => s.subMenuItemId))),
        ];
        const subMap = await this.validation.resolveSubMenuItems(allSubIds);

        let subtotal = new Prisma.Decimal(0);
        const itemsData: ItemData[] = [];

        for (const item of items) {
            const menu = menuMap.get(item.menuItemId)!;
            const itemTotal = menu.price.mul(item.quantity);
            subtotal = subtotal.add(itemTotal);

            const orderSubMenuItemsData: SubMenuData[] = [];
            for (const sub of item.orderSubMenuItems ?? []) {
                const subMenuItem = subMap.get(sub.subMenuItemId)!;
                const qty = sub.quantity ?? 1;
                const subTotal = subMenuItem.price.mul(qty);
                subtotal = subtotal.add(subTotal);

                orderSubMenuItemsData.push({
                    subMenuItemId: sub.subMenuItemId,
                    quantity: qty,
                    unitPrice: subMenuItem.price,
                    totalPrice: subTotal,
                    notes: sub.notes,
                });
            }

            const entry: ItemData = {
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPrice: menu.price,
                totalPrice: itemTotal,
                notes: item.notes,
            };

            if (orderSubMenuItemsData.length > 0) {
                (entry as any).orderSubMenuItem = { create: orderSubMenuItemsData };
            }

            itemsData.push(entry);
        }

        return { subtotal, itemsData };
    }

    /**
     * Applies item changes to an existing order within a transaction.
     *
     * - Items with `orderItemId` + `isCancelled: true`  → soft-cancel the item
     * - Items with `orderItemId` + `isCancelled: false` → update in place
     * - Items without `orderItemId`                     → create new item
     *
     * @returns The recalculated subtotal after all changes.
     */
    async applyItemChanges(
        tx: Prisma.TransactionClient,
        orderId: number,
        items: ProcessOrderItemDto[],
    ): Promise<Prisma.Decimal> {
        this.validation.validateNoDuplicates(items);

        // Validate against existing non-cancelled items in the DB
        await this.validation.validateNoDuplicatesWithExisting(tx, orderId, items);

        // Fetch existing non-cancelled items
        const existingItems = await tx.orderItem.findMany({
            where: { orderId, isCancelled: false },
            include: { orderSubMenuItem: true },
        });

        const existingMap = new Map(existingItems.map((e) => [e.id, e]));

        // Process each incoming item
        for (const incoming of items) {
            if (incoming.orderItemId !== undefined) {
                if (incoming.isCancelled) {
                    // Explicitly cancel this item
                    await tx.orderSubMenuItem.updateMany({
                        where: { orderItemId: incoming.orderItemId },
                        data: { isCancelled: true },
                    });
                    await tx.orderItem.update({
                        where: { id: incoming.orderItemId },
                        data: { isCancelled: true },
                    });
                } else {
                    // Update existing item in place
                    await this.updateExistingItem(tx, incoming, existingMap);
                }
            } else {
                // Create new item
                await this.createNewItem(tx, incoming, orderId);
            }
        }

        // Recalculate subtotal from scratch
        return this.recalculateSubtotal(tx, orderId);
    }

    // #endregion

    // #region Sync Helpers

    /**
     * Recalculates the order-level subtotal from all non-cancelled items and sub-items.
     */
    async recalculateSubtotal(tx: Prisma.TransactionClient, orderId: number): Promise<Prisma.Decimal> {
        const activeItems = await tx.orderItem.findMany({
            where: { orderId, isCancelled: false },
            include: { orderSubMenuItem: { where: { isCancelled: false } } },
        });

        let total = new Prisma.Decimal(0);
        for (const item of activeItems) {
            total = total.add(item.totalPrice);
            for (const sub of item.orderSubMenuItem) {
                total = total.add(sub.totalPrice);
            }
        }
        return total;
    }

    // #endregion

    // #region Private Helpers

    private async updateExistingItem(
        tx: Prisma.TransactionClient,
        incoming: ProcessOrderItemDto,
        existingMap: Map<number, any>,
    ) {
        const existing = existingMap.get(incoming.orderItemId!);
        if (!existing) {
            throwBadRequestException(`Order item ID ${incoming.orderItemId} not found or already cancelled.`);
            return;
        }

        const menuMap = await this.validation.resolveMenuItems([incoming.menuItemId]);
        const menu = menuMap.get(incoming.menuItemId)!;

        // Diff sub-menu items
        const incomingSubIds = new Set(
            (incoming.orderSubMenuItems || []).map((s) => s.subMenuItemId),
        );
        const activeSubs = existing.orderSubMenuItem.filter((s: any) => !s.isCancelled);

        // Cancel removed subs
        const removedSubIds = activeSubs
            .filter((s: any) => !incomingSubIds.has(s.subMenuItemId))
            .map((s: any) => s.id);
        if (removedSubIds.length > 0) {
            await tx.orderSubMenuItem.updateMany({
                where: { id: { in: removedSubIds } },
                data: { isCancelled: true },
            });
        }

        // Fetch sub-menu prices for new items
        const allNeededSubIds = (incoming.orderSubMenuItems || []).map((s) => s.subMenuItemId);
        const subMap = await this.validation.resolveSubMenuItems(allNeededSubIds);

        // Update or create sub-items
        for (const incomingSub of incoming.orderSubMenuItems || []) {
            const match = activeSubs.find((s: any) => s.subMenuItemId === incomingSub.subMenuItemId);
            if (match) {
                const sub = subMap.get(incomingSub.subMenuItemId)!;
                const subTotal = sub.price.mul(incomingSub.quantity ?? 1);
                await tx.orderSubMenuItem.update({
                    where: { id: match.id },
                    data: {
                        quantity: incomingSub.quantity ?? 1,
                        totalPrice: subTotal,
                        notes: incomingSub.notes,
                    },
                });
            } else {
                const sub = subMap.get(incomingSub.subMenuItemId)!;
                const subTotal = sub.price.mul(incomingSub.quantity ?? 1);
                await tx.orderSubMenuItem.create({
                    data: {
                        orderItemId: existing.id,
                        subMenuItemId: incomingSub.subMenuItemId,
                        quantity: incomingSub.quantity ?? 1,
                        unitPrice: sub.price,
                        totalPrice: subTotal,
                        notes: incomingSub.notes,
                    },
                });
            }
        }

        const simpleTotal = menu.price.mul(incoming.quantity);

        await tx.orderItem.update({
            where: { id: existing.id },
            data: {
                quantity: incoming.quantity,
                unitPrice: menu.price,
                totalPrice: simpleTotal,
                notes: incoming.notes,
                status: OrderStatus.PENDING,
            },
        });
    }

    private async createNewItem(
        tx: Prisma.TransactionClient,
        incoming: ProcessOrderItemDto,
        orderId: number,
    ) {
        const menuMap = await this.validation.resolveMenuItems([incoming.menuItemId]);
        const menu = menuMap.get(incoming.menuItemId)!;

        // Resolve sub-menu item prices correctly (not an empty map)
        const allSubIds = (incoming.orderSubMenuItems || []).map((s) => s.subMenuItemId);
        const subMap = await this.validation.resolveSubMenuItems(allSubIds);

        const itemTotal = menu.price.mul(incoming.quantity);
        const orderSubMenuItemsData = this.buildSubMenuData(
            incoming.orderSubMenuItems ?? [],
            subMap,
            new Prisma.Decimal(0),
        );

        const data: any = {
            orderId,
            menuItemId: incoming.menuItemId,
            quantity: incoming.quantity,
            unitPrice: menu.price,
            totalPrice: itemTotal,
            notes: incoming.notes,
        };

        if (orderSubMenuItemsData.length > 0) {
            data.orderSubMenuItem = { create: orderSubMenuItemsData };
        }

        await tx.orderItem.create({ data });
    }

    /**
     * Builds the DB payload for sub-menu items.
     * NOTE: subtotal is passed by reference and mutated for sub-item totals.
     */
    private buildSubMenuData(
        subItems: ProcessOrderSubMenuItemDto[],
        subMap: Map<number, any>,
        subtotal: Prisma.Decimal,
    ): SubMenuData[] {
        if (!subItems.length) return [];

        return subItems.map((sub) => {
            const subMenuItem = subMap.get(sub.subMenuItemId);
            const qty = sub.quantity ?? 1;
            const total = subMenuItem ? subMenuItem.price.mul(qty) : new Prisma.Decimal(0);
            // eslint-disable-next-line no-param-reassign
            // We can't mutate subtotal here since it's a cloned issue — caller handles it
            return {
                subMenuItemId: sub.subMenuItemId,
                quantity: qty,
                unitPrice: subMenuItem?.price ?? new Prisma.Decimal(0),
                totalPrice: total,
                notes: sub.notes,
            };
        });
    }

    // #endregion
}