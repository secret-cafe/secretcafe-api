import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from 'generated/prisma/enums';

export class CreateOrderDto {
    @IsNotEmpty()
    @IsInt()
    tableId!: number;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    orderItems?: CreateOrderItemDto[];
}

export class CreateOrderItemDto {
    @IsNotEmpty()
    @IsInt()
    menuItemId!: number;

    @IsNotEmpty()
    @IsInt()
    @Min(1)
    quantity!: number;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsInt()
    courseNumber?: number;

    @IsOptional()
    @IsBoolean()
    isUpdated?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderSubMenuItemDto)
    orderSubMenuItems?: CreateOrderSubMenuItemDto[];
}

export class CreateOrderSubMenuItemDto {
    @IsNotEmpty()
    @IsInt()
    subMenuItemId!: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    quantity!: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateOrderItemDto {
    @IsNotEmpty()
    @IsInt()
    orderItemId!: number;

    @IsNotEmpty()
    @IsEnum(OrderStatus)
    status!: OrderStatus;
}

export class UpdateOrderStatusDto {
    @IsNotEmpty()
    @IsInt()
    orderId!: number;

    @IsNotEmpty()
    @IsEnum(OrderStatus)
    status!: OrderStatus;
}