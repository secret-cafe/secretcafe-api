import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class CreateMenuDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsNotEmpty()
  @IsString()
  price!: string;

  @IsNotEmpty()
  @IsString()
  menuType!: string;

  @IsNotEmpty()
  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubMenuDto)
  submenu?: SubMenuDto[];
}

class SubMenuDto {
  @IsOptional()
  @IsNumber()
  subMenuItemId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  price!: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
