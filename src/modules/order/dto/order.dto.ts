import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from 'generated/prisma/client';

/** DTO for processing an order — handles both CREATE and UPDATE in one flow. */
export class ProcessOrderDto {
    /** Table UUID (used to look up the active session). */
    @IsNotEmpty()
    @IsUUID()
    tableId!: string;

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
 *
 * All IDs (`orderItemId`, `menuItemId`, `subMenuItemId`) are public UUIDs.
 */
export class ProcessOrderItemDto {
    /** UUID of an existing order item to update or cancel (omit for new items). */
    @IsOptional()
    @IsUUID()
    orderItemId?: string;

    @IsNotEmpty()
    @IsUUID()
    menuItemId!: string;

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
    @IsUUID()
    subMenuItemId!: string;

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
    @IsUUID()
    orderId!: string;

    @IsNotEmpty()
    @IsEnum(OrderStatus)
    status!: OrderStatus;

    /** When true, also updates all non-cancelled order items to the same status. Defaults to false. */
    @IsOptional()
    @IsBoolean()
    isItemsUpdate?: boolean;

    @IsOptional()
    @IsString()
    notes?: string;
}

/** DTO for updating the status of a specific order item. */
export class UpdateOrderItemDto {
    /** The UUID of the order item to update. */
    @IsNotEmpty()
    @IsUUID()
    orderItemId!: string;

    /** The new status to assign to the order item. */
    @IsNotEmpty()
    @IsEnum(OrderStatus)
    status!: OrderStatus;
}