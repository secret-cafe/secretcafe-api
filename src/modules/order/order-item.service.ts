import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { OrderStatus } from 'generated/prisma/enums';
import { randomUUID } from 'crypto';
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
     * Generates public UUIDs for each order item and sub-menu item.
     */
    async prepareNewItems(
        tx: Prisma.TransactionClient,
        items: ProcessOrderItemDto[],
        actorId?: number,
    ): Promise<PreparedItemsResult> {
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
                    orderSubMenuItemId: randomUUID(),
                    subMenuItemId: subMenuItem.id,
                    quantity: qty,
                    unitPrice: subMenuItem.price,
                    totalPrice: subTotal,
                    notes: sub.notes,
                    createdBy: actorId ?? null,
                });
            }

            const entry: ItemData = {
                orderItemId: randomUUID(),
                menuItemId: menu.id,
                quantity: item.quantity,
                unitPrice: menu.price,
                totalPrice: itemTotal,
                notes: item.notes,
                createdBy: actorId ?? null,
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
     * Incoming `orderItemId`s are public UUIDs; `existingMap` is keyed by the
     * same public UUID so the internal numeric id is never needed from the client.
     *
     * @returns The recalculated subtotal after all changes.
     */
    async applyItemChanges(
        tx: Prisma.TransactionClient,
        orderId: number,
        items: ProcessOrderItemDto[],
        actorId?: number,
    ): Promise<Prisma.Decimal> {
        this.validation.validateNoDuplicates(items);

        // Validate against existing non-cancelled items in the DB
        await this.validation.validateNoDuplicatesWithExisting(tx, orderId, items);

        // Fetch existing non-cancelled items (with their sub-menu UUIDs for diffing)
        const existingItems = await tx.orderItem.findMany({
            where: { orderId, isCancelled: false },
            include: {
                orderSubMenuItem: {
                    include: {
                        subMenuItem: { select: { subMenuId: true } },
                    },
                },
            },
        });

        const existingMap = new Map(existingItems.map((e) => [e.orderItemId, e]));

        // Process each incoming item
        for (const incoming of items) {
            if (incoming.orderItemId && incoming.isCancelled) {
                // Explicitly cancel this item
                const existing = existingMap.get(incoming.orderItemId);
                if (!existing) {
                    throwBadRequestException(
                        `Order item ID ${incoming.orderItemId} not found or already cancelled.`,
                    );
                }

                await tx.orderSubMenuItem.updateMany({
                    where: { orderItemId: existing!.id },
                    data: { isCancelled: true, updatedBy: actorId ?? null },
                });
                await tx.orderItem.update({
                    where: { id: existing!.id },
                    data: { isCancelled: true, updatedBy: actorId ?? null },
                });
            } else if (incoming.orderItemId) {
                // Update existing item in place
                await this.updateExistingItem(tx, incoming, existingMap, actorId);
            } else {
                // Create new item
                await this.createNewItem(tx, incoming, orderId, actorId);
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
        existingMap: Map<string | null, any>,
        actorId?: number,
    ) {
        const existing = existingMap.get(incoming.orderItemId!);
        if (!existing) {
            throwBadRequestException(`Order item ID ${incoming.orderItemId} not found or already cancelled.`);
            return;
        }

        const menuMap = await this.validation.resolveMenuItems([incoming.menuItemId]);
        const menu = menuMap.get(incoming.menuItemId)!;

        // Diff sub-menu items by their public UUID (`subMenuId`)
        const incomingSubIds = new Set(
            (incoming.orderSubMenuItems || []).map((s) => s.subMenuItemId),
        );
        const activeSubs = existing.orderSubMenuItem.filter((s: any) => !s.isCancelled);

        // Cancel removed subs
        const removedSubIds = activeSubs
            .filter((s: any) => !incomingSubIds.has(s.subMenuItem?.subMenuId))
            .map((s: any) => s.id);
        if (removedSubIds.length > 0) {
            await tx.orderSubMenuItem.updateMany({
                where: { id: { in: removedSubIds } },
                data: { isCancelled: true, updatedBy: actorId ?? null },
            });
        }

        // Fetch sub-menu prices for new items
        const allNeededSubIds = (incoming.orderSubMenuItems || []).map((s) => s.subMenuItemId);
        const subMap = await this.validation.resolveSubMenuItems(allNeededSubIds);

        // Update or create sub-items
        for (const incomingSub of incoming.orderSubMenuItems || []) {
            const match = activeSubs.find((s: any) => s.subMenuItem?.subMenuId === incomingSub.subMenuItemId);
            if (match) {
                const sub = subMap.get(incomingSub.subMenuItemId)!;
                const subTotal = sub.price.mul(incomingSub.quantity ?? 1);
                await tx.orderSubMenuItem.update({
                    where: { id: match.id },
                    data: {
                        quantity: incomingSub.quantity ?? 1,
                        totalPrice: subTotal,
                        notes: incomingSub.notes,
                        updatedBy: actorId ?? null,
                    },
                });
            } else {
                const sub = subMap.get(incomingSub.subMenuItemId)!;
                const subTotal = sub.price.mul(incomingSub.quantity ?? 1);
                await tx.orderSubMenuItem.create({
                    data: {
                        orderSubMenuItemId: randomUUID(),
                        orderItemId: existing.id,
                        subMenuItemId: sub.id,
                        quantity: incomingSub.quantity ?? 1,
                        unitPrice: sub.price,
                        totalPrice: subTotal,
                        notes: incomingSub.notes,
                        createdBy: actorId ?? null,
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
                updatedBy: actorId ?? null,
            },
        });
    }

    private async createNewItem(
        tx: Prisma.TransactionClient,
        incoming: ProcessOrderItemDto,
        orderId: number,
        actorId?: number,
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
            actorId,
        );

        const data: any = {
            orderId,
            orderItemId: randomUUID(),
            menuItemId: menu.id,
            quantity: incoming.quantity,
            unitPrice: menu.price,
            totalPrice: itemTotal,
            notes: incoming.notes,
            createdBy: actorId ?? null,
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
        subMap: Map<string, any>,
        subtotal: Prisma.Decimal,
        actorId?: number,
    ): SubMenuData[] {
        if (!subItems.length) return [];

        return subItems.map((sub) => {
            const subMenuItem = subMap.get(sub.subMenuItemId);
            const qty = sub.quantity ?? 1;
            const total = subMenuItem ? subMenuItem.price.mul(qty) : new Prisma.Decimal(0);
            // eslint-disable-next-line no-param-reassign
            // We can't mutate subtotal here since it's a cloned issue — caller handles it
            return {
                orderSubMenuItemId: randomUUID(),
                subMenuItemId: subMenuItem?.id,
                quantity: qty,
                unitPrice: subMenuItem?.price ?? new Prisma.Decimal(0),
                totalPrice: total,
                notes: sub.notes,
                createdBy: actorId ?? null,
            };
        });
    }

    // #endregion
}