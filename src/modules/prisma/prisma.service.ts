import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import "dotenv/config";
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from 'generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const adapter = new PrismaMariaDb({
            host: process.env.DATABASE_HOST,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME,
            connectionLimit: 5,
        });

        super({ adapter });
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