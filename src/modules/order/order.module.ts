import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

/**
 * Module that encapsulates order-related functionality.
 *
 * Registers the {@link OrderController} and {@link OrderService}
 * and imports {@link PrismaModule} for database access.
 */
@Module({
  imports: [PrismaModule],
  controllers: [OrderController],
  providers: [OrderService]
})
export class OrderModule {}