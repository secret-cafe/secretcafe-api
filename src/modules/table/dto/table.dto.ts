import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { TableType } from 'generated/prisma/client';

export class CreateTableDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEnum(TableType)
  type!: TableType;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsBoolean()
  enableTimeRate?: boolean;

  @IsOptional()
  @IsBoolean()
  chargePerPerson?: boolean;

  @ValidateIf((o) => o.enableTimeRate === true)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'ratePerMinute must be a valid decimal number' },
  )
  @Min(0)
  ratePerMinute?: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'ratePerHour must be a valid decimal number' },
  )
  @Min(0)
  ratePerHour?: number;

  @IsOptional()
  @IsBoolean()
  rushMode?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTableDto extends PartialType(CreateTableDto) {
  @IsOptional()
  @IsBoolean()
  regenerateQr?: boolean;
}

export class GetTableByTypeDto {
  @IsOptional()
  @IsEnum(TableType)
  type!: TableType;
}