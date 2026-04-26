import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        super();
    }

    async onModuleInit() {
        try {
            await this.$connect();

            // Force actual DB interaction
            await this.$queryRaw`SELECT 1`;

            console.log("DB Connected");
        } catch (e) {
            console.error("DB Connection Failed:", e);
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}