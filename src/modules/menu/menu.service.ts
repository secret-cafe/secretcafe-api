import { Injectable } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { isNonEmptyString } from 'src/common/utils/utils';
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';

@Injectable()
export class MenuService {
    constructor(private prisma: PrismaService, private readonly cloudinaryService: CloudinaryService) { }

    private readonly menuSelect = {
        category: {
            select: {
                id: true,
                name: true,
            },
        },
        id: true,
        name: true,
        price: true,
        menuType: true,
        available: true,
        description: true,
        imageUrl: true,
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

    private async findMenuOrThrow(menuId: number, includePublicId = false) {
        const menu = await this.prisma.menuItem.findFirst({
            where: {
                id: menuId,
                deletedAt: null,
                category: {
                    deletedAt: null,
                    isActive: true,
                },
            },
            select: {
                ...this.menuSelect,
                ...(includePublicId && { publicId: true }),
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!menu) throwNotFoundException('Menu not found');
        return menu;
    }

    private async findAndDeleteMenuImage(id: number) {
        const menu = await this.findMenuOrThrow(id, true);

        if (isNonEmptyString(menu?.publicId)) {
            await this.cloudinaryService.deleteFile(menu?.publicId ?? "");
        }
    }

    async create(data: CreateMenuDto, file?: any) {
        try {
            const { submenu, ...menuData } = data;

            await this.prisma.menuItem.create({
                data: {
                    ...menuData,
                    publicId: file?.filename ?? null,
                    imageUrl: file?.path ?? null,
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

    async findAll() {

        const menu = await this.prisma.menuItem.findMany({
            where: {
                deletedAt: null,
                category: {
                    deletedAt: null,
                    isActive: true,
                },
            },
            select: {
                ...this.menuSelect,
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
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

    async findByCategory(categoryId: number) {

        const categoryMenu = await this.prisma.category.findFirst({
            where: {
                id: categoryId,
                deletedAt: null,
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                menuItems: {
                    where: {
                        deletedAt: null,
                    },
                    select: this.menuSelect,
                },
            },
        });

        if (!categoryMenu) {
            throwNotFoundException('Category menu not found');
            return categoryMenu;
        }

        return {
            status: true,
            message: 'Menu fetched successfully',
            data: categoryMenu,
        };
    }

    async update(id: number, data: UpdateMenuDto, file?: any) {
        const updateData: any = {
            ...data,
        };

        if (isNonEmptyString(file?.path)) {
            await this.findAndDeleteMenuImage(id);

            updateData.publicId = file.filename;
            updateData.imageUrl = file.path;
        }

        const { submenu, ...menuData } = updateData;

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

        try {
            await this.findAndDeleteMenuImage(id);

            await this.prisma.$transaction(async (tx) => {
                await tx.menuItem.update({
                    where: { id },
                    data: {
                        imageUrl: null,
                        publicId: null,
                        deletedAt: new Date(),
                    },
                });

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