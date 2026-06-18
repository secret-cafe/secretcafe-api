import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderItemDto, UpdateOrderStatusDto } from './dto/order.dto';
import { Role, cookieOptions } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import express from 'express';

/**
 * Controller exposing REST endpoints for order management.
 *
 * Provides routes for creating, fetching, and updating orders and their items,
 * with role-based access control enforced via the {@link Auth} decorator.
 */
@Controller('order')
export class OrderController {
    constructor(private readonly orderService: OrderService) { }

    // #region Public Endpoints

    /**
     * Creates or updates an order for a table session.
     *
     * On success, sets the `orderId` cookie on the response for subsequent requests.
     *
     * @param dto - The order creation/update payload.
     * @param res - The Express response object used to set cookies.
     * @returns The result from the order service.
     */
    @Post()
    public async create(@Body() dto: CreateOrderDto, @Res({ passthrough: true }) res: express.Response) {
        const result = await this.orderService.processOrder(dto);

        if (result.orderId) {
            res.cookie('orderId', result.orderId, cookieOptions);
        }

        return result;
    }

    /**
     * Retrieves active orders for the current session.
     *
     * Reads the `orderId` cookie from the request to identify which order to fetch.
     *
     * @param req - The Express request object containing cookies.
     * @returns Active order data from the order service.
     */
    @Get()
    public getActiveOrders(@Req() req: express.Request) {
        const orderId = req.cookies?.orderId ?? 0;
        return this.orderService.getActiveOrders(Number(orderId));
    }

    // #endregion

    // #region Staff Endpoints

    /**
     * Updates the status of a single order item.
     *
     * Requires authentication with at least WAITER role.
     *
     * @param dto - The payload containing the order item ID and new status.
     * @param role - The role of the authenticated user.
     * @returns The result from the order service.
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Patch('order-item')
    public update(@Body() dto: UpdateOrderItemDto, @CurrentUser('role') role: Role) {
        return this.orderService.updateOrderItemStatus(dto, role);
    }

    /**
     * Updates the status of an entire order.
     *
     * Requires authentication with at least WAITER role.
     *
     * @param dto - The payload containing the order ID and new status.
     * @param role - The role of the authenticated user.
     * @returns The result from the order service.
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Patch('order-status')
    public updateOrderStatus(@Body() dto: UpdateOrderStatusDto, @CurrentUser('role') role: Role) {
        return this.orderService.updateOrderStatus(dto.orderId, dto.status, role);
    }

    /**
     * Retrieves active orders grouped by table.
     *
     * Requires authentication with at least CHEF role.
     *
     * @returns Table-wise order data from the order service.
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF)
    @Get('table-orders')
    public getTableWiseOrders() {
        return this.orderService.getTableWiseOrders();
    }

    // #endregion

    // #region Admin Endpoints

    /**
     * Deletes all orders, order items, and sub-menu items.
     *
     * **Warning:** This is a destructive operation intended for development/cleanup.
     * Requires SUPER_ADMIN or ADMIN role.
     *
     * @returns The result from the order service.
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN)
    @Get('clean-orders')
    public cleanOrders() {
        return this.orderService.cleanOrders();
    }

    // #endregion
}