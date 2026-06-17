import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './modules/users/users.module';
import { RoleModule } from './modules/roles/roles.module';
import { CategoryModule } from './modules/category/category.module';
import { MenuModule } from './modules/menu/menu.module';
import { CustomerModule } from './modules/customer/customer.module';
import { CloudinaryModule } from './common/upload/cloudinary/cloudinary.module';
import { TableModule } from './modules/table/table.module';
import { OrderModule } from './modules/order/order.module';
import { OrderController } from './modules/order/order.controller';
import { OrderService } from './modules/order/order.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // so you can use it anywhere
    }),
    CloudinaryModule,
    AuthModule,
    UserModule,
    RoleModule,
    CategoryModule,
    MenuModule,
    CustomerModule,
    TableModule,
    OrderModule],
  controllers: [OrderController],
  providers: [OrderService],
})

export class AppModule { }