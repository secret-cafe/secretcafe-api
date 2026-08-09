import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf, ValidateNested} from 'class-validator';
import { PaymentMethod } from 'generated/prisma/client';

/** A single discount applied to a bill, with its application order. */
export class ApplyDiscountDto {
  /** The ID of the discount master record. */
  @IsNotEmpty()
  @IsInt()
  discountId!: number;

  /** The order in which this discount is applied (1-based). */
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  sequence!: number;
}

/** DTO for generating a bill for a table. */
export class GenerateBillDto {
  /** The ID of the table to generate a bill for. */
  @IsNotEmpty()
  @IsInt()
  tableId!: number;

  /** Optional mobile number to include on the bill. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobileNumber?: string;

  /** Optional notes to include on the bill. */
  @IsOptional()
  @IsString()
  notes?: string;

  /** Optional discounts to apply to the item subtotal. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyDiscountDto)
  @ArrayUnique((o: ApplyDiscountDto) => o.discountId)
  discounts?: ApplyDiscountDto[];
}

/** DTO for marking a bill as paid. */
export class PayBillDto {
  /** The ID of the billing record to mark as paid. */
  @IsNotEmpty()
  @IsInt()
  billingId!: number;

  /** The payment method used (CASH, UPI, CARD, or CASH_ONLINE). */
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  /** Cash amount — required when paymentMethod is CASH_ONLINE. */
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CASH_ONLINE)
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashAmount?: number;

  /** Online amount — required when paymentMethod is CASH_ONLINE. */
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CASH_ONLINE)
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  onlineAmount?: number;

  /** Optional notes about the payment. */
  @IsOptional()
  @IsString()
  notes?: string;
}