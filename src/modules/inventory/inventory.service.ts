import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import {
  throwBadRequestException,
  throwNotFoundException,
} from 'src/common/utils/http-exception.helper';

type InventoryItemRaw = {
  inventoryId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: Prisma.Decimal;
  lowStockThreshold: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly inventorySelect = {
    inventoryId: true,
    name: true,
    sku: true,
    unit: true,
    quantity: true,
    lowStockThreshold: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.InventoryItemSelect;

  private async findInventoryOrThrow(inventoryId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        inventoryId,
        deletedAt: null,
      },
      select: this.inventorySelect,
    });

    if (!item) throwNotFoundException('Inventory item not found');
    return item!;
  }

  private async ensureUniqueSku(sku: string, excludeInventoryId?: string) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: {
        sku,
        deletedAt: null,
        ...(excludeInventoryId && { inventoryId: { not: excludeInventoryId } }),
      },
      select: { id: true },
    });

    if (existing) throwBadRequestException(`SKU "${sku}" already exists`);
  }

  private toResponse(item: InventoryItemRaw) {
    return {
      inventoryId: item.inventoryId,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      quantity: Number(item.quantity),
      lowStockThreshold: Number(item.lowStockThreshold),
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isLowStock: Number(item.quantity) <= Number(item.lowStockThreshold),
    };
  }

  async create(data: CreateInventoryDto, userId?: number) {
    await this.ensureUniqueSku(data.sku);

    try {
      await this.prisma.inventoryItem.create({
        data: {
          inventoryId: randomUUID(),
          name: data.name,
          sku: data.sku,
          unit: data.unit,
          quantity: data.quantity,
          lowStockThreshold: data.lowStockThreshold,
          isActive: data.isActive ?? true,
          createdBy: userId ?? null,
        },
      });

      return {
        status: true,
        message: 'Inventory item created successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to create inventory item',
        error: (error as Error).message,
      };
    }
  }

  async findAll(query: QueryInventoryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      ...(query.search && {
        OR: [
          { name: { contains: query.search } },
          { sku: { contains: query.search } },
        ],
      }),
      ...(query.lowStock !== undefined && {
        quantity: { lte: this.prisma.inventoryItem.fields.lowStockThreshold },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        select: this.inventorySelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      status: true,
      message: 'Inventory items fetched successfully',
      data: {
        items: items.map((item) => this.toResponse(item)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async findOne(inventoryId: string) {
    const item = await this.findInventoryOrThrow(inventoryId);

    return {
      status: true,
      message: 'Inventory item fetched successfully',
      data: this.toResponse(item),
    };
  }

  async update(inventoryId: string, data: UpdateInventoryDto, userId?: number) {
    await this.findInventoryOrThrow(inventoryId);

    if (data.sku) {
      await this.ensureUniqueSku(data.sku, inventoryId);
    }

    try {
      await this.prisma.inventoryItem.updateMany({
        where: {
          inventoryId,
          deletedAt: null,
        },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.sku !== undefined && { sku: data.sku }),
          ...(data.unit !== undefined && { unit: data.unit }),
          ...(data.quantity !== undefined && { quantity: data.quantity }),
          ...(data.lowStockThreshold !== undefined && {
            lowStockThreshold: data.lowStockThreshold,
          }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          updatedBy: userId ?? null,
        },
      });

      return {
        status: true,
        message: 'Inventory item updated successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to update inventory item',
        error: (error as Error).message,
      };
    }
  }

  async delete(inventoryId: string) {
    await this.findInventoryOrThrow(inventoryId);

    try {
      await this.prisma.inventoryItem.updateMany({
        where: {
          inventoryId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      return {
        status: true,
        message: 'Inventory item deleted successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to delete inventory item',
        error: (error as Error).message,
      };
    }
  }
}
