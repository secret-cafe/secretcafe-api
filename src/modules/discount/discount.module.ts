import { Module } from '@nestjs/common';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DiscountController],
  providers: [DiscountService],
  exports: [DiscountService],
})
export class DiscountModule {}
