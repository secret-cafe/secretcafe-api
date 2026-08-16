import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';

/**
 * Supported dashboard period presets.
 */
export enum DashboardPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

/**
 * Allowed time buckets for grouped trend charts. Only these values are accepted
 * from the client so arbitrary SQL/grouping expressions can never be injected.
 */
export enum TrendGroupBy {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * Shared date/period query parameters used across the dashboard endpoints.
 *
 * When `startDate` is provided it takes precedence over `period` (a custom
 * range). If only `startDate` is supplied, the range extends to "now". When
 * neither is supplied the `period` preset is used (defaults to "today").
 */
export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod = DashboardPeriod.TODAY;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
