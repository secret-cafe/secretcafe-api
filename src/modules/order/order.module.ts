import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderValidationService } from './order-validation.service';
import { OrderItemService } from './order-item.service';
import { OrderStatusHistoryService } from './order-status-history.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrderController],
  providers: [OrderService, OrderValidationService, OrderItemService, OrderStatusHistoryService],
  exports: [OrderStatusHistoryService],
})
export class OrderModule {}
