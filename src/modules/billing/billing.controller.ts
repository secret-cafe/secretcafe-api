import { Body, Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { BillingService } from './billing.service';
import { GenerateBillDto, PayBillDto } from './dto/billing.dto';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import type { Request } from 'express';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Generates a bill for an order.
   * Validates that all order items are served before generating.
   * Requires ADMIN or WAITER role.
   */
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.WAITER)
  @Post('generate')
  public generateBill(
    @Body() dto: GenerateBillDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub;
    return this.billingService.generateBill(dto, userId);
  }

  /**
   * Marks a bill as paid with the specified payment method.
   * Also marks the order and all items as COMPLETED.
   * Requires ADMIN or WAITER role.
   */
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.WAITER)
  @Post('pay')
  public payBill(@Body() dto: PayBillDto) {
    return this.billingService.payBill(dto);
  }

  /**
   * Retrieves a bill by order ID.
   * Requires ADMIN or WAITER role.
   */
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.WAITER)
  @Get('order/:orderId')
  public getBillByOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.billingService.getBillByOrder(orderId);
  }

  /**
   * Retrieves all bills.
   * Requires ADMIN or WAITER role.
   */
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.WAITER)
  @Get()
  public getAllBills() {
    return this.billingService.getAllBills();
  }
}