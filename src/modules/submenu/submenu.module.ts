import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SubmenuController } from './submenu.controller';
import { SubmenuService } from './submenu.service';

@Module({
  imports: [PrismaModule],
  controllers: [SubmenuController],
  providers: [SubmenuService],
  exports: [SubmenuService],
})
export class SubmenuModule {}