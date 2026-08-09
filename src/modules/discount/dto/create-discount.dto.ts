import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DiscountType } from 'generated/prisma/client';
import { Transform, Type } from 'class-transformer';

/** DTO for creating a discount master record. */
export class CreateDiscountDto {
  /** The name of the discount. */
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  /** Optional description of the discount. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** The type of discount: PERCENTAGE or AMOUNT. */
  @IsNotEmpty()
  @IsEnum(DiscountType)
  type!: DiscountType;

  /**
   * The discount value.
   * - PERCENTAGE: must be > 0 and <= 100
   * - AMOUNT: must be > 0
   */
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ValidateIf((o) => o.type === DiscountType.PERCENTAGE)
  @Max(100)
  value!: number;

  /** The desired active state. */
  @IsNotEmpty()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive!: boolean;
}
