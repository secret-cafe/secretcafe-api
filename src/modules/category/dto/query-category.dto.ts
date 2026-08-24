import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum CategoryStatus {
  ALL = 'all',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export class QueryCategoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CategoryStatus)
  status?: CategoryStatus;
}
