import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CustomerController } from './customer.controller';
import { MenuService } from '../menu/menu.service';
import { CategoryService } from '../category/category.service';
import { TableService } from '../table/table.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerController],
  providers: [MenuService, CategoryService, TableService]
})

export class CustomerModule {}