import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ApplicationLogService,
  CreateApplicationLogInput,
} from './application-log.service';

describe('ApplicationLogService', () => {
  let service: ApplicationLogService;
  let prisma: {
    applicationLogs: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      applicationLogs: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ApplicationLogService>(ApplicationLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const input: CreateApplicationLogInput = {
      requestId: 'req-1',
      moduleName: 'auth',
      method: 'POST',
      path: '/api/v1/auth/login',
      statusCode: 201,
      requestHeaders: { 'content-type': 'application/json' },
      requestBody: { email: 'admin@example.com' },
      responseBody: { status: true, message: 'Login Successful' },
      ip: '127.0.0.1',
      userId: 'user-1',
      createdBy: 7,
      durationMs: 12,
      error: null,
    };

    it('persists a log entry with a generated logId', async () => {
      prisma.applicationLogs.create.mockResolvedValue({ id: 1 });

      await service.create(input);

      expect(prisma.applicationLogs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          logId: expect.any(String) as unknown,
          requestId: 'req-1',
          moduleName: 'auth',
          method: 'POST',
          path: '/api/v1/auth/login',
          statusCode: 201,
          userId: 'user-1',
          createdBy: 7,
          durationMs: 12,
        }) as Record<string, unknown>,
      });
    });

    it('does not throw when the database write fails', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      prisma.applicationLogs.create.mockRejectedValue(new Error('db down'));

      await expect(service.create(input)).resolves.toBeUndefined();

      consoleError.mockRestore();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation((queries: any[]) =>
        Promise.all(queries),
      );
      prisma.applicationLogs.findMany.mockResolvedValue([]);
      prisma.applicationLogs.count.mockResolvedValue(0);
    });

    it('returns paginated results', async () => {
      const createdAt = new Date('2026-09-13T10:00:00.000Z');
      prisma.applicationLogs.findMany.mockResolvedValue([
        {
          id: 1,
          logId: '00000000-0000-0000-0000-000000000001',
          method: 'POST',
          path: '/api/v1/auth/login',
          statusCode: 201,
          createdAt,
        },
      ]);
      prisma.applicationLogs.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.status).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('applies filters to the where clause', async () => {
      await service.findAll({
        moduleName: 'auth',
        method: 'post',
        statusCode: 400,
        userId: 'user-1',
        createdBy: 7,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-13T00:00:00.000Z',
      });

      const firstCall = prisma.applicationLogs.findMany.mock.calls[0] as [
        { where: Record<string, any> },
      ];
      const where = firstCall[0].where;
      expect(where.moduleName).toEqual({ contains: 'auth' });
      expect(where.method).toEqual({ equals: 'POST' });
      expect(where.statusCode).toBe(400);
      expect(where.userId).toEqual({ contains: 'user-1' });
      expect(where.createdBy).toBe(7);
      expect(where.createdAt).toEqual({
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-13T00:00:00.000Z'),
      });
    });

    it('builds an OR search across scalar fields', async () => {
      await service.findAll({ search: 'auth' });

      const firstCall = prisma.applicationLogs.findMany.mock.calls[0] as [
        { where: Record<string, any> },
      ];
      const where = firstCall[0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { requestId: { contains: 'auth' } },
          { moduleName: { contains: 'auth' } },
          { path: { contains: 'auth' } },
        ]),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the log does not exist', async () => {
      prisma.applicationLogs.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('00000000-0000-0000-0000-000000000001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the log entry when found', async () => {
      const row = {
        id: 1,
        logId: '00000000-0000-0000-0000-000000000001',
        method: 'POST',
        path: '/api/v1/auth/login',
        statusCode: 201,
        createdAt: new Date('2026-09-13T10:00:00.000Z'),
      };
      prisma.applicationLogs.findUnique.mockResolvedValue(row);

      const result = await service.findOne(
        '00000000-0000-0000-0000-000000000001',
      );

      expect(result.status).toBe(true);
      expect(result.data).toEqual(row);
      expect(prisma.applicationLogs.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { logId: '00000000-0000-0000-0000-000000000001' },
        }),
      );
    });
  });
});
