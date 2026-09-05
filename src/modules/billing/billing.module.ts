import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrderModule } from '../order/order.module';
import { TableService } from '../table/table.service';

@Module({
  imports: [PrismaModule, OrderModule],
  controllers: [BillingController],
  providers: [BillingService, TableService],
  exports: [BillingService],
})
export class BillingModule {}
