import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TableStatus } from 'generated/prisma/client';
import { Type } from 'class-transformer';

export class TableSessionDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  tableId!: number;

  @IsNotEmpty()
  @IsEnum(TableStatus)
  status?: TableStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  guestCount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}