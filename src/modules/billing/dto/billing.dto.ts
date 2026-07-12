import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaymentMethod } from 'generated/prisma/client';

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