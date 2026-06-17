import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderItemDto, UpdateOrderStatusDto } from './dto/order.dto';
import { Role, cookieOptions } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import express from 'express';

@Controller('order')
export class OrderController {
    constructor(private readonly orderService: OrderService) { }

    @Post()
    public async create(@Body() dto: CreateOrderDto, @Res({ passthrough: true }) res: express.Response) {
        const result = await this.orderService.processOrder(dto);

        if (result.orderId) {
            res.cookie('orderId', result.orderId, cookieOptions);
        }

        return result;
    }

    @Get()
    public getActiveOrders(@Req() req: express.Request) {
        const orderId = req.cookies?.orderId ?? 0;
        return this.orderService.getActiveOrders(Number(orderId));
    }

    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Patch('order-item')
    public update(@Body() dto: UpdateOrderItemDto, @CurrentUser('role') role: Role) {
        return this.orderService.updateOrderItemStatus(dto, role);
    }

    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF, Role.WAITER)
    @Patch('order-status')
    public updateOrderStatus(@Body() dto: UpdateOrderStatusDto, @CurrentUser('role') role: Role) {
        return this.orderService.updateOrderStatus(dto.orderId, dto.status, role);
    }

    @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.CHEF)
    @Get('table-orders')
    public getTabeWiseOrders() {
        return this.orderService.getTableWiseOrders();
    }

    @Auth(Role.SUPER_ADMIN, Role.ADMIN)
    @Get('clean-orders')
    public cleanOrders() {
        return this.orderService.cleanOrders();
    }
}