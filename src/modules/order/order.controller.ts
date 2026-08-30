import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { OrderService } from './order.service';
import { ProcessOrderDto, UpdateOrderItemDto, UpdateOrderStatusDto } from './dto/order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { Role, cookieOptions } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { Request, Response } from 'express';

@Controller('order')
export class OrderController {
    constructor(private readonly orderService: OrderService) { }

    // #region Public Endpoints

    /**
     * Creates or updates an order for a table session.
     *
     * - **CREATE**: Omit `orderId` — a new order is created.
     * - **UPDATE**: Provide `orderId` + items with `orderItemId` —
     *   existing items are updated, new items created, omitted items cancelled.
     *
     * All IDs (`tableId`, `menuItemId`, `subMenuItemId`, `orderItemId`) are UUIDs.
     * No auth required (customer-facing via QR).
     */
    @Post()
    public async processOrder(
        @Body() dto: ProcessOrderDto,
        @Res({ passthrough: true }) res: Response,
        @CurrentUser('userId') createdById?: number,
    ) {
        const result = await this.orderService.processOrder(dto, createdById);

        if (result?.orderId) {
            res.cookie('orderId', result.orderId, cookieOptions);
        }

        return result;
    }

    /**
     * Retrieves active order for the current session (via cookie).
     * The cookie stores the public `orderId` UUID.
     * No auth required (customer-facing).
     */
    @Get()
    public getActiveOrders(@Req() req: Request) {
        const orderId = req.cookies?.orderId;
        return this.orderService.getActiveOrders(orderId);
    }

    // #endregion

    // #region Staff Endpoints

    /**
     * Updates the status of an entire order.
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Patch('order-status')
    public updateOrderStatus(
        @Body() dto: UpdateOrderStatusDto,
        @CurrentUser('role') role: Role,
        @CurrentUser('userId') updatedById?: number,
    ) {
        return this.orderService.updateOrderStatus(dto, role, updatedById);
    }

    /**
     * Updates the status of a single order item.
     *
     * Requires authentication with at least WAITER role.
     *
     * @param dto - The payload containing the order item UUID and new status.
     * @param role - The role of the authenticated user.
     * @returns The result from the order service.
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Patch('order-item-status')
    public update(
        @Body() dto: UpdateOrderItemDto,
        @CurrentUser('role') role: Role,
        @CurrentUser('userId') updatedById?: number,
    ) {
        return this.orderService.updateOrderItemStatus(dto, role, updatedById);
    }

    /**
     * Retrieves active orders grouped by table (paginated).
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Get('table-orders')
    public getTableWiseOrders(@Query() query: QueryOrderDto) {
        return this.orderService.getTableWiseOrders(query);
    }

    /**
     * Retrieves the full status history timeline for an order (by UUID).
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Get('history/:orderId')
    public getOrderStatusHistory(
        @Param('orderId', ParseUUIDPipe) orderId: string,
    ) {
        return this.orderService.getOrderStatusHistory(orderId);
    }

    // #endregion

    // #region Admin Endpoints

    /**
     * Deletes all orders (destructive, dev-only).
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN)
    @Get('clean-orders')
    public cleanOrders() {
        return this.orderService.cleanOrders();
    }

    // #endregion
}