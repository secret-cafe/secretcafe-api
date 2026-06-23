import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/users/users.module';
import { RoleModule } from './modules/roles/roles.module';
import { CategoryModule } from './modules/category/category.module';
import { MenuModule } from './modules/menu/menu.module';
import { CustomerModule } from './modules/customer/customer.module';
import { CloudinaryModule } from './common/upload/cloudinary/cloudinary.module';
import { TableModule } from './modules/table/table.module';
import { OrderModule } from './modules/order/order.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CloudinaryModule,
    AuthModule,
    UserModule,
    RoleModule,
    CategoryModule,
    MenuModule,
    CustomerModule,
    TableModule,
    OrderModule,
    BillingModule,
  ],
})

export class AppModule { }