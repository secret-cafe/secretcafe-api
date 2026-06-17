import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';
import { isNonEmptyString } from 'src/common/utils/utils';

@Injectable()
export class CategoryService {

  constructor(private prisma: PrismaService, private readonly cloudinaryService: CloudinaryService) { }

  private readonly categorySelect = {
    id: true,
    name: true,
    description: true,
    imageUrl: true,
    isActive: true,
    createdAt: true,
  };

  private async findCategoryOrThrow(id: number, includePublicId = false) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
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

  private async findAndDeleteCategoryImage(id: number) {
    const category = await this.findCategoryOrThrow(id, true);

    if (isNonEmptyString(category?.publicId)) {
      await this.cloudinaryService.deleteFile(category?.publicId ?? "");
    }
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: this.categorySelect,
    });

    return {
      status: true,
      message: 'Categories fetched successfully',
      data: categories,
    };
  }

  async findOne(id: number) {
    const category = await this.findCategoryOrThrow(id);

    return {
      status: true,
      message: 'Category fetched successfully',
      data: category,
    };
  }

  async create(data: CreateCategoryDto, file?: any) {
    try {
      await this.prisma.category.create({
        data: {
          ...data,
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

  async update(id: number, data: UpdateCategoryDto, file?: any) {
    try {
      const updateData: any = {
        ...data,
      };

      if (isNonEmptyString(file?.path)) {
        await this.findAndDeleteCategoryImage(id);

        updateData.publicId = file.filename;
        updateData.imageUrl = file.path;
      }

      await this.prisma.category.update({
        where: { id },
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

  async delete(id: number) {
    try {
      await this.findAndDeleteCategoryImage(id);

      await this.prisma.category.update({
        where: { id },
        data: {
          imageUrl: null,
          publicId: null,
          deletedAt: new Date(),
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