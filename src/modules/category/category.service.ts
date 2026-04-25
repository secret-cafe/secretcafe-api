import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { throwNotFoundException } from '../utils/http-exception.helper';

@Injectable()
export class CategoryService {
  
  constructor(private prisma: PrismaService) { }

  private readonly categorySelect = {
    id: true,
    name: true,
    description: true,
    imageUrl: true,
    isActive: true,
  };

  private async findCategoryOrThrow(id: number) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: this.categorySelect,
    });

    if (!category) throwNotFoundException('Category not found');
    return category;
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

  async create(data: CreateCategoryDto) {
    try {
      await this.prisma.category.create({
        data,
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

  async update(id: number, data: UpdateCategoryDto) {
    await this.findCategoryOrThrow(id);

    try {

      await this.prisma.category.update({
        where: { id },
        data,
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
    await this.findCategoryOrThrow(id);

    try {
      await this.prisma.category.update({
        where: { id },
        data: {
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