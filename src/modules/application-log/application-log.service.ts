import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { randomUUID } from 'crypto';
import { throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryApplicationLogDto } from './dto/query-application-log.dto';

export interface CreateApplicationLogInput {
  requestId: string | null;
  moduleName: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  requestHeaders?: Prisma.InputJsonValue | null;
  requestBody?: Prisma.InputJsonValue | null;
  responseBody?: Prisma.InputJsonValue | null;
  ip: string | null;
  userId: string | null;
  createdBy: number | null;
  durationMs: number | null;
  error?: Prisma.InputJsonValue | null;
}

@Injectable()
export class ApplicationLogService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly logSelect = {
    logId: true,
    requestId: true,
    moduleName: true,
    method: true,
    path: true,
    statusCode: true,
    requestBody: true,
    responseBody: true,
    ip: true,
    userId: true,
    durationMs: true,
    error: true,
    createdAt: true,
  } satisfies Prisma.ApplicationLogsSelect;

  /**
   * Persists an application log entry.
   *
   * This method never throws: a failing log write must never break the
   * original request/response flow.
   */
  async create(input: CreateApplicationLogInput): Promise<void> {
    try {
      await this.prisma.applicationLogs.create({
        data: {
          logId: randomUUID(),
          requestId: input.requestId,
          moduleName: input.moduleName,
          method: input.method,
          path: input.path,
          statusCode: input.statusCode,
          requestHeaders: (input.requestHeaders ??
            null) as Prisma.InputJsonValue,
          requestBody: (input.requestBody ?? null) as Prisma.InputJsonValue,
          responseBody: (input.responseBody ?? null) as Prisma.InputJsonValue,
          ip: input.ip,
          userId: input.userId,
          createdBy: input.createdBy ?? null,
          durationMs: input.durationMs,
          error: (input.error ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      console.error('Failed to persist application log:', error);
    }
  }

  async findAll(query: QueryApplicationLogDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationLogsWhereInput = {
      ...(query.search && {
        OR: [
          { requestId: { contains: query.search } },
          { moduleName: { contains: query.search } },
          { method: { contains: query.search } },
          { path: { contains: query.search } },
          { ip: { contains: query.search } },
          { userId: { contains: query.search } },
        ],
      }),
      ...(query.requestId && { requestId: { contains: query.requestId } }),
      ...(query.moduleName && { moduleName: { contains: query.moduleName } }),
      ...(query.method && { method: { equals: query.method.toUpperCase() } }),
      ...(query.path && { path: { contains: query.path } }),
      ...(query.statusCode !== undefined && { statusCode: query.statusCode }),
      ...(query.userId && { userId: { contains: query.userId } }),
      ...(query.createdBy !== undefined && { createdBy: query.createdBy }),
      ...(query.ip && { ip: { contains: query.ip } }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.applicationLogs.findMany({
        select: this.logSelect,
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.applicationLogs.count({ where }),
    ]);

    return {
      status: true,
      message: 'Application logs fetched successfully',
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(logId: string) {
    const item = await this.prisma.applicationLogs.findUnique({
      select: this.logSelect,
      where: { logId },
    });

    if (!item) throwNotFoundException('Application log not found');

    return {
      status: true,
      message: 'Application log fetched successfully',
      data: item,
    };
  }

  // #region Remove All Orders
  public async cleanlogs() {
    await this.prisma.applicationLogs.deleteMany({});

    return {
      status: true,
      message: 'Logs cleaned successfully.',
    };
  }
  // #endregion
}
