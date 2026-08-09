import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { ToggleDiscountDto } from './dto/toggle-discount.dto';
import {
  throwBadRequestException,
  throwNotFoundException,
} from 'src/common/utils/http-exception.helper';
import { Prisma, DiscountType } from 'generated/prisma/client';

@Injectable()
export class DiscountService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly discountSelect = {
    id: true,
    name: true,
    description: true,
    type: true,
    value: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.DiscountSelect;

  private async findDiscountOrThrow(id: number) {
    const discount = await this.prisma.discount.findFirst({
      where: { id, deletedAt: null },
      select: this.discountSelect,
    });

    if (!discount) throwNotFoundException('Discount not found');
    return discount;
  }

  private validateValue(type: DiscountType, value: number) {
    if (type === DiscountType.PERCENTAGE && (value <= 0 || value > 100)) {
      throwBadRequestException(
        'Percentage discount value must be > 0 and <= 100.',
      );
    }

    if (type === DiscountType.AMOUNT && value <= 0) {
      throwBadRequestException('Amount discount value must be > 0.');
    }
  }

  async findAll() {
    const discounts = await this.prisma.discount.findMany({
      where: { deletedAt: null },
      select: this.discountSelect,
      orderBy: { createdAt: 'asc' },
    });

    return {
      status: true,
      message: 'Discounts fetched successfully.',
      data: discounts,
    };
  }

  async findOne(id: number) {
    const discount = await this.findDiscountOrThrow(id);

    return {
      status: true,
      message: 'Discount fetched successfully.',
      data: discount,
    };
  }

  async create(data: CreateDiscountDto, userId?: number) {
    this.validateValue(data.type, data.value);

    try {
      await this.prisma.discount.create({
        data: {
          ...data,
          createdBy: userId || null,
        },
      });

      return {
        status: true,
        message: 'Discount created successfully.',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to create discount',
        error: (error as Error).message,
      };
    }
  }

  async update(id: number, data: UpdateDiscountDto, userId?: number) {
    await this.findDiscountOrThrow(id);

    if (data.type !== undefined && data.value !== undefined) {
      this.validateValue(data.type, data.value);
    }

    try {
      await this.prisma.discount.update({ 
        where: { id },
        data: {
          ...data,
          updatedBy: userId || null,
        },
      });

      return {
        status: true,
        message: 'Discount updated successfully.',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to update discount',
        error: (error as Error).message,
      };
    }
  }

  async toggle(id: number, data: ToggleDiscountDto, userId?: number) {
    await this.findDiscountOrThrow(id);

    try {
      await this.prisma.discount.update({
        where: { id },
        data: {
          isActive: data.isActive,
          updatedBy: userId || null,
        },
      });

      return {
        status: true,
        message: data.isActive
          ? 'Discount activated successfully.'
          : 'Discount deactivated successfully.',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to update discount status',
        error: (error as Error).message,
      };
    }
  }

  async delete(id: number) {
    await this.findDiscountOrThrow(id);

    try {
      await this.prisma.discount.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: null,
        },
      });

      return {
        status: true,
        message: 'Discount deleted successfully.',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to delete discount',
        error: (error as Error).message,
      };
    }
  }
}
