import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TableStatus } from 'generated/prisma/client';

export class TableSessionDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  tableId!: string;

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
