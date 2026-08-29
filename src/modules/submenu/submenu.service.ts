import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { CreateSubMenuItemDto, UpdateSubMenuItemDto } from './dto/submenu.dto';
import { QuerySubMenuDto, SubMenuStatus } from './dto/query-submenu.dto';

@Injectable()
export class SubmenuService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly subMenuSelect = {
    subMenuId: true,
    name: true,
    price: true,
    available: true,
    description: true,
    imageUrl: true,
    createdAt: true,
  } satisfies Prisma.SubMenuItemSelect;

  /**
   * Keep the response key `id` but its value is the UUID `subMenuId`.
   * The internal numeric auto-increment `id` is never exposed.
   */
  private mapSubMenu(subMenu: any): any {
    if (!subMenu) return subMenu;
    const { subMenuId, ...rest } = subMenu;
    return { id: subMenuId, ...rest };
  }

  private async findSubMenuOrThrow(subMenuId: string) {
    const item = await this.prisma.subMenuItem.findFirst({
      where: { subMenuId, deletedAt: null },
      select: this.subMenuSelect,
    });

    if (!item) throwNotFoundException('Sub menu item not found');
    return item!;
  }

  async create(dto: CreateSubMenuItemDto, createdById?: number) {
    const existing = await this.prisma.subMenuItem.findFirst({
      where: { name: dto.name, deletedAt: null },
    });

    if (existing) {
      throwBadRequestException(`Sub menu item with name "${dto.name}" already exists.`);
      return;
    }

    await this.prisma.subMenuItem.create({
      data: {
        subMenuId: randomUUID(),
        name: dto.name,
        price: dto.price,
        available: dto.available ?? true,
        description: dto.description ?? null,
        createdBy: createdById ?? null,
      },
    });

    return {
      status: true,
      message: 'Sub menu item created successfully.',
    };
  }

  async findAll(query?: QuerySubMenuDto) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;
    const status = query?.status;
    const ignorePagination = status === SubMenuStatus.ALL;

    const where: Prisma.SubMenuItemWhereInput = {
      deletedAt: null,
      ...(query?.search && {
        name: { contains: query.search },
      }),
      ...((status === SubMenuStatus.ACTIVE || status === SubMenuStatus.INACTIVE) && {
        available: status === SubMenuStatus.ACTIVE,
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.subMenuItem.findMany({
        where,
        select: this.subMenuSelect,
        orderBy: { createdAt: 'desc' },
        ...(ignorePagination ? {} : { skip, take: limit }),
      }),
      this.prisma.subMenuItem.count({ where }),
    ]);

    return {
      status: true,
      message: 'Sub menu items fetched successfully.',
      data: items.map((item) => this.mapSubMenu(item)),
      ...(ignorePagination
        ? {}
        : {
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        }),
    };
  }

  async findOne(subMenuId: string) {
    const item = await this.findSubMenuOrThrow(subMenuId);

    return {
      status: true,
      message: 'Sub menu item fetched successfully.',
      data: this.mapSubMenu(item),
    };
  }

  async update(subMenuId: string, dto: UpdateSubMenuItemDto, updatedById?: number) {
    await this.findSubMenuOrThrow(subMenuId);

    await this.prisma.subMenuItem.updateMany({
      where: { subMenuId, deletedAt: null },
      data: {
        ...dto,
        updatedBy: updatedById ?? null,
      },
    });

    return {
      status: true,
      message: 'Sub menu item updated successfully.',
    };
  }

  async delete(subMenuId: string, updatedById?: number) {
    await this.findSubMenuOrThrow(subMenuId);

    const item = await this.prisma.subMenuItem.findFirst({
      where: { subMenuId, deletedAt: null },
      select: { id: true },
    });

    if (!item) {
      throwNotFoundException('Sub menu item not found');
      return;
    }

    const internalId = item.id;

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete the SubMenuItem
      await tx.subMenuItem.update({
        where: { id: internalId },
        data: { deletedAt: new Date(), updatedBy: updatedById ?? null },
      });

      // Soft-delete related MenuSubMenu records
      await tx.menuSubMenu.updateMany({
        where: { subMenuItemId: internalId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    return {
      status: true,
      message: 'Sub menu item deleted successfully.',
    };
  }
}
