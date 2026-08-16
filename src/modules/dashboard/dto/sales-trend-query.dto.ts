import { IsEnum, IsOptional } from 'class-validator';
import { DashboardQueryDto, TrendGroupBy } from './dashboard-query.dto';

/**
 * Query for the sales trend / revenue-vs-orders charts.
 * `groupBy` is a strict enum to prevent arbitrary grouping from the client.
 */
export class SalesTrendQueryDto extends DashboardQueryDto {
  @IsOptional()
  @IsEnum(TrendGroupBy)
  groupBy?: TrendGroupBy = TrendGroupBy.DAY;
}
