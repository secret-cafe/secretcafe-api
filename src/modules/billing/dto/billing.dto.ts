import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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

  /** The payment method used (CASH, UPI, or CARD). */
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  /** Optional notes about the payment. */
  @IsOptional()
  @IsString()
  notes?: string;
}