import { IsBoolean, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

/** DTO for activating/deactivating a discount. */
export class ToggleDiscountDto {
  /** The desired active state. */
  @IsNotEmpty()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive!: boolean;
}
