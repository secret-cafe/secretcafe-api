import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard analytics module.
 *
 * `PrismaModule` is `@Global`, so `PrismaService` is available without an
 * explicit import here. Access is restricted to admin roles at the controller
 * level via `@Auth`.
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
