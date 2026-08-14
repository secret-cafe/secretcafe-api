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
import { DiscountModule } from './modules/discount/discount.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SeedModule } from './modules/seed/seed.module';
import { SubmenuModule } from './modules/submenu/submenu.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CloudinaryModule,
    SeedModule,
    AuthModule,
    UserModule,
    RoleModule,
    CategoryModule,
    MenuModule,
    CustomerModule,
    TableModule,
    OrderModule,
    BillingModule,
    DiscountModule,
    SubmenuModule,
    InventoryModule,
  ],
})
export class AppModule {}
