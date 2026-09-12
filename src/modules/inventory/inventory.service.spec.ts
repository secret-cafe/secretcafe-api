import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InventoryStatus } from './dto/query-inventory.dto';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    inventoryItem: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      fields: { lowStockThreshold: string };
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      inventoryItem: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        fields: { lowStockThreshold: 'lowStockThreshold' },
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw BadRequestException when SKU already exists', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({ id: 1 });

      await expect(
        service.create({
          name: 'Tomato',
          sku: 'VEG-001',
          unit: 'kg',
          quantity: 10,
          lowStockThreshold: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create an inventory item with a generated inventoryId', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue({ id: 1 });

      const result = await service.create(
        {
          name: 'Tomato',
          sku: 'VEG-001',
          unit: 'kg',
          quantity: 10,
          lowStockThreshold: 2,
        },
        5,
      );

      expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inventoryId: expect.any(String) as unknown,
            createdBy: 5,
          }) as Record<string, unknown>,
        }),
      );
      expect(result.status).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when item does not exist', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the item with isLowStock computed', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        inventoryId: '00000000-0000-0000-0000-000000000000',
        name: 'Tomato',
        sku: 'VEG-001',
        unit: 'kg',
        quantity: 1,
        lowStockThreshold: 2,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findOne(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(result.data.isLowStock).toBe(true);
      expect(result.data.quantity).toBe(1);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation((queries: any[]) => Promise.all(queries));
      prisma.inventoryItem.findMany.mockResolvedValue([]);
      prisma.inventoryItem.count.mockResolvedValue(0);
    });

    it('should filter by status=low using the lowStockThreshold', async () => {
      await service.findAll({ page: 1, limit: 10, status: InventoryStatus.LOW });

      const where = prisma.inventoryItem.findMany.mock.calls[0][0].where;
      expect(where.quantity).toEqual({ lte: 'lowStockThreshold' });
    });

    it('should filter by status=out using quantity <= 0', async () => {
      await service.findAll({ page: 1, limit: 10, status: InventoryStatus.OUT });

      const where = prisma.inventoryItem.findMany.mock.calls[0][0].where;
      expect(where.quantity).toEqual({ lte: 0 });
    });

    it('should filter by status=inactive using isActive false', async () => {
      await service.findAll({ page: 1, limit: 10, status: InventoryStatus.INACTIVE });

      const where = prisma.inventoryItem.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(false);
    });
  });
});
