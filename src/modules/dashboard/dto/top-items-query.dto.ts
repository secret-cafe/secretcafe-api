import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DashboardQueryDto } from './dashboard-query.dto';

/**
 * Sort option for top-selling items.
 */
export enum TopItemsSort {
  QUANTITY = 'quantity',
  REVENUE = 'revenue',
}

export class TopItemsQueryDto extends DashboardQueryDto {
  @IsOptional()
  @IsEnum(TopItemsSort)
  sort?: TopItemsSort = TopItemsSort.QUANTITY;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
