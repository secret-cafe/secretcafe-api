import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from 'generated/prisma/enums';

/** DTO for creating a new order or updating an existing order for a table session. */
export class CreateOrderDto {
    /** The ID of the table for which the order is being placed. */
    @IsNotEmpty()
    @IsInt()
    tableId!: number;

    /** Optional notes or special instructions for the order. */
    @IsOptional()
    @IsString()
    notes?: string;

    /** The list of menu items included in the order. */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    orderItems?: CreateOrderItemDto[];
}

/** DTO for a single menu item within an order. */
export class CreateOrderItemDto {
    /** The ID of the menu item being ordered. */
    @IsNotEmpty()
    @IsInt()
    menuItemId!: number;

    /** The quantity of this menu item. Must be at least 1. */
    @IsNotEmpty()
    @IsInt()
    @Min(1)
    quantity!: number;

    /** Optional notes or modifications for this specific item. */
    @IsOptional()
    @IsString()
    notes?: string;

    /** The course number for multi-course orders (e.g., 1 = starter, 2 = main). */
    @IsOptional()
    @IsInt()
    courseNumber?: number;

    /** Flag indicating whether this item's details were updated (used for status reset on modification). */
    @IsOptional()
    @IsBoolean()
    isUpdated?: boolean;

    /** Optional sub-menu items (modifiers/extras) attached to this menu item. */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderSubMenuItemDto)
    orderSubMenuItems?: CreateOrderSubMenuItemDto[];
}

/** DTO for a sub-menu item (modifier/extra) attached to an order item. */
export class CreateOrderSubMenuItemDto {
    /** The ID of the sub-menu item (e.g., extra topping, side). */
    @IsNotEmpty()
    @IsInt()
    subMenuItemId!: number;

    /** The quantity of this sub-menu item. Must be at least 1. */
    @IsOptional()
    @IsInt()
    @Min(1)
    quantity!: number;

    /** Optional notes for this sub-menu item. */
    @IsOptional()
    @IsString()
    notes?: string;
}

/** DTO for updating the status of a specific order item. */
export class UpdateOrderItemDto {
    /** The ID of the order item to update. */
    @IsNotEmpty()
    @IsInt()
    orderItemId!: number;

    /** The new status to assign to the order item. */
    @IsNotEmpty()
    @IsEnum(OrderStatus)
    status!: OrderStatus;
}

/** DTO for updating the status of an entire order. */
export class UpdateOrderStatusDto {
    /** The ID of the order to update. */
    @IsNotEmpty()
    @IsInt()
    orderId!: number;

    /** The new status to assign to the order. */
    @IsNotEmpty()
    @IsEnum(OrderStatus)
    status!: OrderStatus;
}