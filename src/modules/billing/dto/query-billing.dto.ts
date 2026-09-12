import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentStatus } from 'generated/prisma/client';

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

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
