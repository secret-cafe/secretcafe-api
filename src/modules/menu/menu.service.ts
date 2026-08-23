import { Injectable } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { isNonEmptyString } from 'src/common/utils/utils';
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';

@Injectable()
export class MenuService {
    constructor(private prisma: PrismaService, private readonly cloudinaryService: CloudinaryService) { }

    /**
     * Base select for fetching menu items.
     * Internally uses the new MenuSubMenu junction table,
     * but the response is transformed back to `subMenuItems` for API compatibility.
     */
    private readonly menuSelect = {
        category: {
            select: {
                categoryId: true,
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
        menuSubMenus: {
            where: { deletedAt: null },
            select: {
                subMenuItem: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        available: true,
                        description: true,
                        imageUrl: true,
                    },
                },
            },
        },
    };

    /**
     * Keep the response key `id` but its value is the UUID `categoryId`.
     * The internal numeric category auto-increment `id` is never exposed.
     */
    private mapCategory(category: any): any {
        if (!category) return category;
        const { categoryId, ...rest } = category;
        return { ...rest, id: categoryId };
    }

    /**
     * Resolve a public category UUID into the internal numeric category id.
     */
    private async resolveCategoryIdOrThrow(categoryId: string): Promise<number> {
        const category = await this.prisma.category.findFirst({
            where: {
                categoryId,
                deletedAt: null,
            },
            select: { id: true },
        });

        if (!category) throwNotFoundException('Category not found');
        return category!.id;
    }

    /**
     * Transforms a raw menu item (with menuSubMenus) into the legacy
     * API response format with `subMenuItems` array.
     */
    private transformToLegacyFormat(menu: any): any {
        if (!menu) return menu;

        const { menuSubMenus, category, ...rest } = menu;

        return {
            ...rest,
            category: category ? this.mapCategory(category) : null,
            subMenuItems: menuSubMenus
                ?.filter((msm: any) => msm.subMenuItem)
                .map((msm: any) => msm.subMenuItem) ?? [],
        };
    }

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
                        categoryId: true,
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
            const { categoryId, submenu, ...menuData } = data;
            const categoryInternalId = await this.resolveCategoryIdOrThrow(categoryId);

            await this.prisma.menuItem.create({
                data: {
                    ...menuData,
                    categoryId: categoryInternalId,
                    publicId: file?.filename ?? null,
                    imageUrl: file?.path ?? null,
                    ...(submenu && submenu.length > 0 && {
                        menuSubMenus: {
                            create: await this.prepareSubMenuCreates(submenu),
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
        const menus = await this.prisma.menuItem.findMany({
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
                        categoryId: true,
                        name: true,
                    },
                },
            },
        });

        return {
            status: true,
            message: 'Menu fetched successfully',
            data: menus.map((menu) => this.transformToLegacyFormat(menu)),
        };
    }

    async findOne(id: number) {
        const menu = await this.findMenuOrThrow(id);

        return {
            status: true,
            message: 'Menu fetched successfully',
            data: this.transformToLegacyFormat(menu),
        };
    }

    async findByCategory(categoryId: string) {
        const categoryMenu = await this.prisma.category.findFirst({
            where: {
                categoryId,
                deletedAt: null,
                isActive: true,
            },
            select: {
                categoryId: true,
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

        const { categoryId: cid, ...rest } = categoryMenu;

        return {
            status: true,
            message: 'Menu fetched successfully',
            data: {
                ...rest,
                id: cid,
                menuItems: categoryMenu.menuItems.map((item) => this.transformToLegacyFormat(item)),
            },
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

        const { submenu, categoryId, ...menuData } = updateData;

        try {
            await this.prisma.menuItem.update({
                where: { id },
                data: {
                    ...menuData,
                    ...(categoryId !== undefined && { categoryId: await this.resolveCategoryIdOrThrow(categoryId) }),
                    ...(submenu !== undefined && {
                        menuSubMenus: {
                            // Soft-delete existing mappings
                            updateMany: {
                                where: { deletedAt: null },
                                data: { deletedAt: new Date() },
                            },
                            // Create new mappings
                            create: await this.prepareSubMenuCreates(submenu),
                        },
                    }),
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

                // Soft-delete related MenuSubMenu records
                await tx.menuSubMenu.updateMany({
                    where: {
                        menuItemId: id,
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

    // #region Private Helpers

    /**
     * Prepares the data for creating MenuSubMenu records.
     *
     * For each submenu item:
     * - If `subMenuItemId` is provided, uses that existing record directly.
     * - Otherwise, tries to find an existing SubMenuItem by name.
     * - If not found, creates a new standalone SubMenuItem.
     *
     * Then links via MenuSubMenu.
     */
    private async prepareSubMenuCreates(submenu: any[]): Promise<any[]> {
        const result: any[] = [];

        for (const item of submenu) {
            let subMenuItem;

            // 1. If subMenuItemId is provided, look up by ID
            if (item.subMenuItemId) {
                subMenuItem = await this.prisma.subMenuItem.findFirst({
                    where: {
                        id: item.subMenuItemId,
                        deletedAt: null,
                    },
                });

                if (!subMenuItem) {
                    throwBadRequestException(
                        `Sub menu item with ID ${item.subMenuItemId} not found.`,
                    );
                    return [];
                }
            } 
            // 2. Fall back to find-or-create by name
            else {
                subMenuItem = await this.prisma.subMenuItem.findFirst({
                    where: {
                        name: item.name!,
                        deletedAt: null,
                    },
                });

                if (!subMenuItem) {
                    subMenuItem = await this.prisma.subMenuItem.create({
                        data: {
                            name: item.name!,
                            price: item.price!,
                            available: item.available ?? true,
                            description: item.description ?? null,
                        },
                    });
                }
            }

            result.push({
                subMenuItemId: subMenuItem.id,
            });
        }

        return result;
    }

    // #endregion
}