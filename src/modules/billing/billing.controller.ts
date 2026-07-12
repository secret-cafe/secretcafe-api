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
   * Generates a bill for a table.
   * - FAMILY: requires an order with all items SERVED
   * - POD/HALL: bills by time charge; if order exists, validates items served too
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
   * Also marks the order and all items as COMPLETED (if linked).
   */
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.WAITER)
  @Post('pay')
  public payBill(@Body() dto: PayBillDto) {
    return this.billingService.payBill(dto);
  }

  /**
   * Retrieves a bill by table ID.
   */
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.WAITER)
  @Get('table/:tableId')
  public getBillByTable(
    @Param('tableId', ParseIntPipe) tableId: number,
  ) {
    return this.billingService.getBillByTable(tableId);
  }

  /**
   * Retrieves all bills.
   */
  @Auth(Role.SUPER_ADMIN, Role.ADMIN, Role.WAITER)
  @Get()
  public getAllBills() {
    return this.billingService.getAllBills();
  }
}