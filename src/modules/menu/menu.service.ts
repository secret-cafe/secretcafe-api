import { Injectable } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwNotFoundException } from 'src/utils/http-exception.helper';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Injectable()
export class MenuService {
    constructor(private prisma: PrismaService) { }

    private readonly menuSelect = {
        id: true,
        name: true,
        price: true,
        available: true,
        description: true,
        imageUrl: true,
        category: {
            select: {
                id: true,
                name: true,
            },
        },
        subMenuItems: {
            select: {
                id: true,
                name: true,
                price: true,
                available: true,
                description: true,
                imageUrl: true,
            },
        },
    };

    async create(data: CreateMenuDto, imagePath?: string) {
        try {
            const { submenu, ...menuData } = data;

            await this.prisma.menuItem.create({
                data: {
                    ...menuData,
                    imageUrl: imagePath ?? null,
                    ...(submenu && submenu.length > 0 && {
                        subMenuItems: {
                            create: submenu.map((item) => ({
                                name: item.name!,
                                price: item.price!,
                                available: item.available ?? true,
                                description: item.description ?? null,
                            })),
                        },
                    }),
                },
            });

            return {
                status: true,
                message: 'Menu created successfully.',
            };
        } catch (error) {
            return {
                status: false,
                message: 'Failed to create menu',
                error: (error as Error).message,
            };
        }
    }

    private async findMenuOrThrow(id: number) {
        const menu = await this.prisma.menuItem.findFirst({
            where: {
                id,
                deletedAt: null,
            },
            select: this.menuSelect,
        });

        if (!menu) throwNotFoundException('Menu not found');
        return menu;
    }

    async findAll() {
        const menu = await this.prisma.menuItem.findMany({
            where: { deletedAt: null },
            select: this.menuSelect,
        });

        return {
            status: true,
            message: 'Menu fetched successfully',
            data: menu,
        };
    }

    async findOne(id: number) {
        const menu = await this.findMenuOrThrow(id);

        return {
            status: true,
            message: 'Menu fetched successfully',
            data: menu,
        };
    }

    async update(id: number, data: UpdateMenuDto) {
        await this.findMenuOrThrow(id);

        const { submenu, ...menuData } = data;

        try {
            await this.prisma.menuItem.update({
                where: { id },
                data: {
                    ...menuData,
                    subMenuItems: submenu
                        ? {
                            deleteMany: {},
                            create: submenu.map((item) => ({
                                name: item.name,
                                price: item.price,
                                available: item.available ?? true,
                                description: item.description ?? null,
                            })),
                        }
                        : undefined,
                },
            });

            return {
                status: true,
                message: 'Menu updated successfully',
            };
        } catch (error) {
            return {
                status: false,
                message: 'Failed to update menu',
                error: (error as Error).message,
            };
        }
    }

    async delete(id: number) {
        await this.findMenuOrThrow(id);

        try {
            await this.prisma.$transaction(async (tx) => {
                // 1. soft delete menu
                await tx.menuItem.update({
                    where: { id },
                    data: {
                        deletedAt: new Date(),
                    },
                });

                // 2. soft delete all submenu items
                await tx.subMenuItem.updateMany({
                    where: {
                        menuId: id,
                        deletedAt: null,
                    },
                    data: {
                        deletedAt: new Date(),
                    },
                });
            });

            return {
                status: true,
                message: 'Menu deleted successfully',
            };
        } catch (error) {
            return {
                status: false,
                message: 'Failed to delete menu',
                error: (error as Error).message,
            };
        }
    }
}