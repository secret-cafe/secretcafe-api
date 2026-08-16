import { Controller, Get, Query } from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { SalesTrendQueryDto } from './dto/sales-trend-query.dto';
import { TopItemsQueryDto } from './dto/top-items-query.dto';
import { RecentOrdersQueryDto } from './dto/recent-orders-query.dto';

/**
 * Administrative dashboard endpoints.
 *
 * All endpoints follow the project's read-response convention:
 * `{ status: true, message, data }`.
 */
@Controller('dashboard')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private ok<T>(message: string, data: T) {
    return { status: true, message, data };
  }

  /** Consolidated data for the top KPI cards. */
  @Get('summary')
  async summary(@Query() query: DashboardQueryDto) {
    const data = await this.dashboardService.getSummary(query);
    return this.ok('Dashboard summary fetched successfully', data);
  }

  /** Grouped revenue + order trend for the requested range/bucket. */
  @Get('sales-trend')
  async salesTrend(@Query() query: SalesTrendQueryDto) {
    const data = await this.dashboardService.getSalesTrend(query);
    return this.ok('Sales trend fetched successfully', data);
  }

  /** Current order-status distribution. */
  @Get('order-status')
  async orderStatus(@Query() query: DashboardQueryDto) {
    const data = await this.dashboardService.getOrderStatusDistribution(query);
    return this.ok('Order status distribution fetched successfully', data);
  }

  /** Best-selling items for the period. */
  @Get('top-items')
  async topItems(@Query() query: TopItemsQueryDto) {
    const data = await this.dashboardService.getTopItems(query);
    return this.ok('Top-selling items fetched successfully', data);
  }

  /** Realized payment-method breakdown. */
  @Get('payment-methods')
  async paymentMethods(@Query() query: DashboardQueryDto) {
    const data = await this.dashboardService.getPaymentMethods(query);
    return this.ok('Payment methods fetched successfully', data);
  }

  /** Inventory levels with health status. */
  @Get('inventory')
  async inventoryOverview() {
    const data = await this.dashboardService.getInventoryOverview();
    return this.ok('Inventory overview fetched successfully', data);
  }

  /** Latest orders with pagination. */
  @Get('recent-orders')
  async recentOrders(@Query() query: RecentOrdersQueryDto) {
    const data = await this.dashboardService.getRecentOrders(query);
    return this.ok('Recent orders fetched successfully', data);
  }

  /** Most critical low-stock alerts first. */
  @Get('low-stock')
  async lowStock() {
    const data = await this.dashboardService.getLowStockAlerts();
    return this.ok('Low stock alerts fetched successfully', data);
  }

  /** Revenue vs orders chart series. */
  @Get('revenue-vs-orders')
  async revenueVsOrders(@Query() query: SalesTrendQueryDto) {
    const data = await this.dashboardService.getRevenueVsOrders(query);
    return this.ok('Revenue vs orders fetched successfully', data);
  }
}
