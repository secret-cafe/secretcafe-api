import { Prisma } from 'generated/prisma/client';

/** The shared include used by billing list/detail queries. */
export const billingInclude = {
  session: {
    select: {
      id: true,
      tableId: true,
      guestCount: true,
      startedAt: true,
      endedAt: true,
      table: {
        select: { id: true, tableId: true, name: true, type: true },
      },
    },
  },
  order: {
    select: {
      id: true,
      orderId: true,
      orderNumber: true,
      items: {
        where: { isCancelled: false },
        include: {
          menuItem: { select: { id: true, name: true, price: true } },
          orderSubMenuItem: {
            where: { isCancelled: false },
            include: {
              subMenuItem: { select: { id: true, name: true, price: true } },
            },
          },
        },
      },
    },
  },
  billingDiscounts: {
    orderBy: { sequence: 'asc' },
    include: {
      discount: { select: { id: true, discountId: true, name: true } },
    },
  },
} satisfies Prisma.BillingInclude;

export type BillingInclude = typeof billingInclude;

/** A billing row with all shared relations loaded. */
export type BillingWithRelations = Prisma.BillingGetPayload<{
  include: BillingInclude;
}>;