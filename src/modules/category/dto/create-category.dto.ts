import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}