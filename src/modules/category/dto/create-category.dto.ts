import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  description!: string;
}