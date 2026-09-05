import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Query DTO for paginated billing listing. */
export class QueryBillingDto {
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
}
