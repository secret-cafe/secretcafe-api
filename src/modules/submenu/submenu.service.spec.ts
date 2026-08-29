import { Test, TestingModule } from '@nestjs/testing';
import { SubmenuService } from './submenu.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('SubmenuService', () => {
  let service: SubmenuService;
  let prisma: {
    subMenuItem: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    menuSubMenu: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      subMenuItem: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      menuSubMenu: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmenuService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SubmenuService>(SubmenuService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should throw NotFoundException when sub menu item does not exist', async () => {
      prisma.subMenuItem.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the sub menu item with id equal to subMenuId UUID', async () => {
      const subMenuId = '00000000-0000-0000-0000-000000000000';
      prisma.subMenuItem.findFirst.mockResolvedValue({
        subMenuId,
        name: 'Extra Cheese',
        price: 30,
        available: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findOne(subMenuId);

      expect(result.data.id).toBe(subMenuId);
    });
  });

  describe('findAll', () => {
    it('should return pagination and map the UUID to id', async () => {
      prisma.$transaction.mockResolvedValue([
        [
          {
            subMenuId: 'sub-1',
            name: 'Extra Cheese',
            price: 30,
            available: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        22,
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 22,
        totalPages: 3,
      });
      expect(result.data[0].id).toBe('sub-1');
    });
  });

  describe('create', () => {
    it('should create a sub menu item with a generated subMenuId and createdBy', async () => {
      prisma.subMenuItem.findFirst.mockResolvedValue(null);
      prisma.subMenuItem.create.mockResolvedValue({ id: 1 });

      const result = await service.create(
        { name: 'Extra Cheese', price: '30', available: true },
        3,
      );

      expect(prisma.subMenuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subMenuId: expect.any(String) as unknown,
            createdBy: 3,
          }) as Record<string, unknown>,
        }),
      );
      expect(result.status).toBe(true);
    });
  });
});
