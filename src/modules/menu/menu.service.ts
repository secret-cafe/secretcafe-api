import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { randomUUID } from 'crypto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { isNonEmptyString } from 'src/common/utils/utils';
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';
import { QueryMenuDto, MenuStatus } from './dto/query-menu.dto';

@Injectable()
export class MenuService {
    constructor(private prisma: PrismaService, private readonly cloudinaryService: CloudinaryService) { }

    /**
     * Base select for fetching menu items.
     * Internally uses the new MenuSubMenu junction table,
     * but the response is transformed back to `subMenuItems` for API compatibility.
     */
    private readonly menuSelect = {
        menuId: true,
        name: true,
        price: true,
        menuType: true,
        available: true,
        description: true,
        imageUrl: true,
        createdAt: true,
        menuSubMenus: {
            where: { deletedAt: null },
            select: {
                subMenuItem: {
                    select: {
                        subMenuId: true,
                        name: true,
                        price: true,
                        available: true,
                        description: true,
                        imageUrl: true,
                    },
                },
            },
        },
    } satisfies Prisma.MenuItemSelect;

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
     * Keep the response key `id` but its value is the UUID `menuId`.
     */
    private mapMenu(menu: any): any {
        if (!menu) return menu;
        const { menuId, ...rest } = menu;
        return { id: menuId, ...rest };
    }

    /**
     * Keep the response key `id` but its value is the UUID `subMenuId`.
     */
    private mapSubMenu(subMenu: any): any {
        if (!subMenu) return subMenu;
        const { subMenuId, ...rest } = subMenu;
        return { ...rest, id: subMenuId };
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
     * Resolve a public menu UUID into the internal numeric menu item id.
     */
    private async resolveMenuItemIdOrThrow(menuId: string): Promise<number> {
        const menu = await this.prisma.menuItem.findFirst({
            where: {
                menuId,
                deletedAt: null,
            },
            select: { id: true },
        });

        if (!menu) throwNotFoundException('Menu not found');
        return menu!.id;
    }

    /**
     * Transforms a raw menu item (with menuSubMenus) into the legacy
     * API response format with `subMenuItems` array.
     */
    private transformToLegacyFormat(menu: any): any {
        if (!menu) return menu;

        const { menuSubMenus, category, ...rest } = menu;

        return {
            ...this.mapMenu({ ...rest }),
            category: category ? this.mapCategory(category) : null,
            subMenuItems: menuSubMenus
                ?.filter((msm: any) => msm.subMenuItem)
                .map((msm: any) => this.mapSubMenu(msm.subMenuItem)) ?? [],
        };
    }

    private async findMenuOrThrow(menuId: string, includePublicId = false) {
        const menu = await this.prisma.menuItem.findFirst({
            where: {
                menuId,
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

    private async findAndDeleteMenuImage(menuId: string) {
        const menu = await this.findMenuOrThrow(menuId, true);

        if (isNonEmptyString(menu?.publicId)) {
            await this.cloudinaryService.deleteFile(menu?.publicId ?? "");
        }
    }

    async create(data: CreateMenuDto, file?: any, createdById?: number) {
        try {
            const { categoryId, submenu, ...menuData } = data;
            const categoryInternalId = await this.resolveCategoryIdOrThrow(categoryId);

            await this.prisma.menuItem.create({
                data: {
                    ...menuData,
                    menuId: randomUUID(),
                    categoryId: categoryInternalId,
                    createdBy: createdById ?? null,
                    publicId: file?.filename ?? null,
                    imageUrl: file?.path ?? null,
                    ...(submenu && submenu.length > 0 && {
                        menuSubMenus: {
                            create: await this.prepareSubMenuCreates(submenu, createdById),
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

    async findAll(query?: QueryMenuDto) {
        const page = query?.page ?? 1;
        const limit = query?.limit ?? 10;
        const skip = (page - 1) * limit;
        const status = query?.status;
        const ignorePagination = status === MenuStatus.ALL;

        const where: Prisma.MenuItemWhereInput = {
            deletedAt: null,
            category: {
                deletedAt: null,
                isActive: true,
            },
            ...(query?.search && {
                name: { contains: query.search },
            }),
            ...((status === MenuStatus.ACTIVE || status === MenuStatus.INACTIVE) && {
                available: status === MenuStatus.ACTIVE,
            }),
        };

        const [menus, total] = await this.prisma.$transaction([
            this.prisma.menuItem.findMany({
                where,
                select: {
                    category: {
                        select: {
                            categoryId: true,
                            name: true,
                        },
                    },
                    ...this.menuSelect,
                },
                orderBy: { createdAt: 'desc' },
                ...(ignorePagination ? {} : { skip, take: limit }),
            }),
            this.prisma.menuItem.count({ where }),
        ]);

        return {
            status: true,
            message: 'Menu fetched successfully',
            data: menus.map((menu) => this.transformToLegacyFormat(menu)),
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

    async findOne(menuId: string) {
        const menu = await this.findMenuOrThrow(menuId);

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
                    select: {
                        ...this.menuSelect,
                        category: {
                            select: {
                                categoryId: true,
                                name: true,
                            },
                        },
                    },
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

    async update(menuId: string, data: UpdateMenuDto, file?: any, updatedById?: number) {
        const updateData: any = {
            ...data,
            updatedBy: updatedById ?? null,
        };

        if (isNonEmptyString(file?.path)) {
            await this.findAndDeleteMenuImage(menuId);

            updateData.publicId = file.filename;
            updateData.imageUrl = file.path;
        }

        const { submenu, categoryId, ...menuData } = updateData;

        try {
            const menuInternalId = await this.resolveMenuItemIdOrThrow(menuId);

            await this.prisma.menuItem.update({
                where: { id: menuInternalId },
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
                            create: await this.prepareSubMenuCreates(submenu, updatedById),
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

    async delete(menuId: string, updatedById?: number) {
        try {
            await this.findAndDeleteMenuImage(menuId);

            const menuInternalId = await this.resolveMenuItemIdOrThrow(menuId);

            await this.prisma.$transaction(async (tx) => {
                await tx.menuItem.update({
                    where: { id: menuInternalId },
                    data: {
                        imageUrl: null,
                        publicId: null,
                        deletedAt: new Date(),
                        updatedBy: updatedById ?? null,
                    },
                });

                // Soft-delete related MenuSubMenu records
                await tx.menuSubMenu.updateMany({
                    where: {
                        menuItemId: menuInternalId,
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
     * - If `subMenuId` is provided, uses that existing record directly.
     * - Otherwise, tries to find an existing SubMenuItem by name.
     * - If not found, creates a new standalone SubMenuItem.
     *
     * Then links via MenuSubMenu.
     */
    private async prepareSubMenuCreates(submenu: any[], createdById?: number): Promise<any[]> {
        const result: any[] = [];

        for (const item of submenu) {
            let subMenuItem;

            // 1. If subMenuId is provided, look up by UUID
            if (item.subMenuItemId) {
                subMenuItem = await this.prisma.subMenuItem.findFirst({
                    where: {
                        subMenuId: item.subMenuItemId,
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
                            subMenuId: randomUUID(),
                            name: item.name!,
                            price: item.price!,
                            available: item.available ?? true,
                            description: item.description ?? null,
                            createdBy: createdById ?? null,
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