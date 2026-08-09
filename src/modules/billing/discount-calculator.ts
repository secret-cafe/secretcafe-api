import { Prisma, DiscountType } from 'generated/prisma/client';

export interface AppliedDiscountInput {
  discountId: number;
  type: DiscountType;
  value: Prisma.Decimal | number | string;
  sequence: number;
}

export interface AppliedDiscountResult {
  discountId: number;
  type: DiscountType;
  value: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  sequence: number;
}

export interface DiscountCalculationResult {
  discounts: AppliedDiscountResult[];
  totalDiscount: Prisma.Decimal;
}

/**
 * Applies a list of discounts sequentially against the item subtotal only.
 *
 * - Discounts are applied in ascending `sequence` order.
 * - PERCENTAGE discounts are computed off the remaining item subtotal.
 * - AMOUNT discounts subtract a fixed amount.
 * - The item subtotal is never allowed to go negative (clamped at zero).
 * - Time charges and per-person charges are intentionally excluded here.
 *
 * @param itemSubtotal - The undiscounted item subtotal.
 * @param appliedDiscounts - The discounts to apply, in no particular order.
 */
export function calculateDiscounts(
  itemSubtotal: Prisma.Decimal | number | string,
  appliedDiscounts: AppliedDiscountInput[],
): DiscountCalculationResult {
  const base = new Prisma.Decimal(itemSubtotal);
  let remaining = base;

  const sorted = [...appliedDiscounts].sort((a, b) => a.sequence - b.sequence);

  const discounts: AppliedDiscountResult[] = [];

  for (const discount of sorted) {
    let discountAmount = new Prisma.Decimal(0);

    if (remaining.greaterThan(0)) {
      if (discount.type === DiscountType.PERCENTAGE) {
        const rate = new Prisma.Decimal(discount.value).dividedBy(100);
        discountAmount = remaining.mul(rate);
      } else {
        // AMOUNT
        discountAmount = new Prisma.Decimal(discount.value);
      }

      // Clamp so the item subtotal never goes negative
      if (discountAmount.greaterThan(remaining)) {
        discountAmount = remaining;
      }
    }

    discounts.push({
      discountId: discount.discountId,
      type: discount.type,
      value: new Prisma.Decimal(discount.value),
      discountAmount,
      sequence: discount.sequence,
    });

    remaining = remaining.sub(discountAmount);
  }

  const totalDiscount = base.sub(remaining);

  return {
    discounts,
    totalDiscount,
  };
}
