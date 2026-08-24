import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto, CategoryStatus } from './dto/query-category.dto';
import { throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';
import { isNonEmptyString } from 'src/common/utils/utils';

@Injectable()
export class CategoryService {

  constructor(private prisma: PrismaService, private readonly cloudinaryService: CloudinaryService) { }

  private readonly categorySelect = {
    categoryId: true,
    name: true,
    description: true,
    imageUrl: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.CategorySelect;

  /**
   * Keep the response key `id` but its value is the UUID `categoryId`.
   * The internal numeric auto-increment `id` is never exposed.
   */
  private mapCategory(category: any): any {
    if (!category) return category;
    const { categoryId, ...rest } = category;
    return { id: categoryId, ...rest };
  }

  private async findCategoryOrThrow(categoryId: string, includePublicId = false) {
    const category = await this.prisma.category.findFirst({
      where: {
        categoryId,
        deletedAt: null,
      },
      select: {
        ...this.categorySelect,
        ...(includePublicId && { publicId: true }),
      }
    });

    if (!category) throwNotFoundException('Category not found');
    return category;
  }

  private async findAndDeleteCategoryImage(categoryId: string) {
    const category = await this.findCategoryOrThrow(categoryId, true);

    if (isNonEmptyString(category?.publicId)) {
      await this.cloudinaryService.deleteFile(category?.publicId ?? "");
    }
  }

  async findAll(query?: QueryCategoryDto) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;
    const status = query?.status;
    const ignorePagination = status === CategoryStatus.ALL;

    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(query?.search && {
        name: { contains: query.search },
      }),
      ...((status === CategoryStatus.ACTIVE || status === CategoryStatus.INACTIVE) && {
        isActive: status === CategoryStatus.ACTIVE,
      }),
    };

    const [categories, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        select: this.categorySelect,
        orderBy: { createdAt: 'desc' },
        ...(ignorePagination ? {} : { skip, take: limit }),
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      status: true,
      message: 'Categories fetched successfully',
      data: categories.map((category) => this.mapCategory(category)),
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

  async findOne(categoryId: string) {
    const category = await this.findCategoryOrThrow(categoryId);

    return {
      status: true,
      message: 'Category fetched successfully',
      data: this.mapCategory(category),
    };
  }

  async create(data: CreateCategoryDto, createdById?: number, file?: any) {
    try {
      await this.prisma.category.create({
        data: {
          ...data,
          categoryId: randomUUID(),
          createdBy: createdById ?? null,
          publicId: file?.filename ?? null,
          imageUrl: file?.path ?? null,
        },
      });

      return {
        status: true,
        message: 'Category created successfully.',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to create category',
        error: (error as Error).message,
      };
    }
  }

  async update(categoryId: string, data: UpdateCategoryDto, file?: any, updatedById?: number) {
    try {
      const updateData: any = {
        ...data,
        updatedBy: updatedById ?? null,
      };

      if (isNonEmptyString(file?.path)) {
        await this.findAndDeleteCategoryImage(categoryId);

        updateData.publicId = file.filename;
        updateData.imageUrl = file.path;
      }

      await this.prisma.category.updateMany({
        where: {
          categoryId,
          deletedAt: null,
        },
        data: updateData,
      });

      return {
        status: true,
        message: 'Category updated successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to update category',
        error: (error as Error).message,
      };
    }
  }

  async delete(categoryId: string, updatedById?: number) {
    try {
      await this.findAndDeleteCategoryImage(categoryId);

      await this.prisma.category.updateMany({
        where: {
          categoryId,
          deletedAt: null,
        },
        data: {
          imageUrl: null,
          publicId: null,
          isActive: false,
          deletedAt: new Date(),
          updatedBy: updatedById ?? null,
        },
      });

      return {
        status: true,
        message: 'Category deleted successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to delete category',
        error: (error as Error).message,
      };
    }
  }
}