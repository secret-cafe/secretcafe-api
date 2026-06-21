import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from 'generated/prisma/client';

/** DTO for processing an order — handles both CREATE and UPDATE in one flow. */
export class ProcessOrderDto {
    /** Table ID (used to look up the active session). */
    @IsNotEmpty()
    @IsInt()
    tableId!: number;

    /** Optional notes for the order. */
    @IsOptional()
    @IsString()
    notes?: string;

    /** The list of items to place or update. */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProcessOrderItemDto)
    orderItems!: ProcessOrderItemDto[];
}

/**
 * DTO for a single menu item in an order.
 *
 * - `orderItemId` present + `isCancelled` false → update existing item in place
 * - `orderItemId` present + `isCancelled` true  → cancel this item
 * - `orderItemId` absent                        → create a brand-new item
 */
export class ProcessOrderItemDto {
    /** ID of an existing order item to update or cancel (omit for new items). */
    @IsOptional()
    @IsInt()
    orderItemId?: number;

    @IsNotEmpty()
    @IsInt()
    menuItemId!: number;

    @IsNotEmpty()
    @IsInt()
    @Min(1)
    quantity!: number;

    /** Explicitly mark this item as cancelled. */
    @IsOptional()
    @IsBoolean()
    isCancelled?: boolean;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProcessOrderSubMenuItemDto)
    orderSubMenuItems?: ProcessOrderSubMenuItemDto[];
}

/** DTO for a sub-menu item attached to an order item. */
export class ProcessOrderSubMenuItemDto {
    @IsNotEmpty()
    @IsInt()
    subMenuItemId!: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    quantity?: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

/** DTO for updating the status of an entire order. */
export class UpdateOrderStatusDto {
    @IsNotEmpty()
    @IsInt()
    orderId!: number;

    @IsNotEmpty()
    @IsEnum(OrderStatus)
    status!: OrderStatus;

    @IsOptional()
    @IsString()
    notes?: string;
}