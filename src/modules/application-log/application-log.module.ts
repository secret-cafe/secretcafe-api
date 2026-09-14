import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ApplicationLogController } from './application-log.controller';
import { ApplicationLogInterceptor } from './application-log.interceptor';
import { ApplicationLogService } from './application-log.service';

@Module({
  imports: [PrismaModule],
  controllers: [ApplicationLogController],
  providers: [
    ApplicationLogService,
    { provide: APP_INTERCEPTOR, useClass: ApplicationLogInterceptor },
  ],
})
export class ApplicationLogModule {}
