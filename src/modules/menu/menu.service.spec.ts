import { Test, TestingModule } from '@nestjs/testing';
import { MenuService } from './menu.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';

describe('MenuService', () => {
  let service: MenuService;
  let prisma: {
    menuItem: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    category: {
      findFirst: jest.Mock;
    };
    subMenuItem: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    menuSubMenu: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      menuItem: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      category: { findFirst: jest.fn() },
      subMenuItem: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      menuSubMenu: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: { deleteFile: jest.fn() } },
      ],
    }).compile();

    service = module.get<MenuService>(MenuService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return the menu with id equal to the menuId UUID', async () => {
      const menuId = '00000000-0000-0000-0000-000000000000';
      prisma.menuItem.findFirst.mockResolvedValue({
        menuId,
        name: 'Pizza',
        price: 250,
        menuType: 'Veg',
        available: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { categoryId: 'cat-1', name: 'Fast Food' },
        menuSubMenus: [
          {
            subMenuItem: {
              subMenuId: 'sub-1',
              name: 'Extra Cheese',
              price: 30,
              available: true,
              updatedAt: new Date(),
            },
          },
        ],
      });

      const result = await service.findOne(menuId);

      expect(result.data.id).toBe(menuId);
      expect(result.data.id).not.toBe(undefined);
      expect(result.data.subMenuItems[0].id).toBe('sub-1');
    });
  });

  describe('findAll', () => {
    it('should return pagination and map the UUID to id', async () => {
      prisma.$transaction.mockResolvedValue([
        [
          {
            menuId: 'menu-1',
            name: 'Pizza',
            price: 250,
            menuType: 'Veg',
            available: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            category: { categoryId: 'cat-1', name: 'Fast Food' },
            menuSubMenus: [],
          },
        ],
        25,
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
      expect(result.data[0].id).toBe('menu-1');
    });
  });

  describe('create', () => {
    it('should create a menu with a generated menuId and createdBy', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 5 });
      prisma.menuItem.create.mockResolvedValue({ id: 1 });

      const result = await service.create(
        {
          name: 'Pizza',
          price: '250',
          menuType: 'Veg',
          categoryId: 'cat-1',
          available: true,
        },
        undefined,
        7,
      );

      expect(prisma.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            menuId: expect.any(String) as unknown,
            createdBy: 7,
          }) as Record<string, unknown>,
        }),
      );
      expect(result.status).toBe(true);
    });
  });
});
