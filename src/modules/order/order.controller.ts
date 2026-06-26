import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { OrderService } from './order.service';
import { ProcessOrderDto, UpdateOrderItemDto, UpdateOrderStatusDto } from './dto/order.dto';
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
     * No auth required (customer-facing via QR).
     */
    @Post()
    public async processOrder(
        @Body() dto: ProcessOrderDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const result = await this.orderService.processOrder(dto);

        if (result?.orderId) {
            res.cookie('orderId', result.orderId, cookieOptions);
        }

        return result;
    }

    /**
     * Retrieves active order for the current session (via cookie).
     * No auth required (customer-facing).
     */
    @Get()
    public getActiveOrders(@Req() req: Request) {
        const orderId = req.cookies?.orderId ?? 0;
        return this.orderService.getActiveOrders(Number(orderId));
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
    ) {
        return this.orderService.updateOrderStatus(dto, role);
    }

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
    @Patch('order-item-status')
    public update(@Body() dto: UpdateOrderItemDto, @CurrentUser('role') role: Role) {
        return this.orderService.updateOrderItemStatus(dto, role);
    }

    /**
     * Retrieves active orders grouped by table.
     */
    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF)
    @Get('table-orders')
    public getTableWiseOrders() {
        return this.orderService.getTableWiseOrders();
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