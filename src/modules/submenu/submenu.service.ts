import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { CreateSubMenuItemDto, UpdateSubMenuItemDto } from './dto/submenu.dto';

@Injectable()
export class SubmenuService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly subMenuSelect = {
    id: true,
    name: true,
    price: true,
    available: true,
    description: true,
    imageUrl: true,
    createdAt: true,
  };

  async create(dto: CreateSubMenuItemDto) {
    const existing = await this.prisma.subMenuItem.findFirst({
      where: { name: dto.name, deletedAt: null },
    });

    if (existing) {
      throwBadRequestException(`Sub menu item with name "${dto.name}" already exists.`);
      return;
    }

    await this.prisma.subMenuItem.create({
      data: {
        name: dto.name,
        price: dto.price,
        available: dto.available ?? true,
        description: dto.description ?? null
      },
    });

    return {
      status: true,
      message: 'Sub menu item created successfully.',
    };
  }

  async findAll() {
    const items = await this.prisma.subMenuItem.findMany({
      where: { deletedAt: null },
      select: this.subMenuSelect,
    });

    return {
      status: true,
      message: 'Sub menu items fetched successfully.',
      data: items,
    };
  }

  async findOne(id: number) {
    const item = await this.prisma.subMenuItem.findFirst({
      where: { id, deletedAt: null },
      select: this.subMenuSelect,
    });

    if (!item) {
      throwNotFoundException(`Sub menu item with ID ${id} not found.`);
      return;
    }

    return {
      status: true,
      message: 'Sub menu item fetched successfully.',
      data: item,
    };
  }

  async update(id: number, dto: UpdateSubMenuItemDto) {
    const existing = await this.prisma.subMenuItem.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throwNotFoundException(`Sub menu item with ID ${id} not found.`);
      return;
    }

    await this.prisma.subMenuItem.update({
      where: { id },
      data: {
        ...dto,
      },
    });

    return {
      status: true,
      message: 'Sub menu item updated successfully.',
    };
  }

  async delete(id: number) {
    const existing = await this.prisma.subMenuItem.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throwNotFoundException(`Sub menu item with ID ${id} not found.`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete the SubMenuItem
      await tx.subMenuItem.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Soft-delete related MenuSubMenu records
      await tx.menuSubMenu.updateMany({
        where: { subMenuItemId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    return {
      status: true,
      message: 'Sub menu item deleted successfully.',
    };
  }
}