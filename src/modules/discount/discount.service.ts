import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { ToggleDiscountDto } from './dto/toggle-discount.dto';
import { QueryDiscountDto } from './dto/query-discount.dto';
import {
  throwBadRequestException,
  throwNotFoundException,
} from 'src/common/utils/http-exception.helper';
import { Prisma, DiscountType } from 'generated/prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class DiscountService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly discountSelect = {
    discountId: true,
    name: true,
    description: true,
    type: true,
    value: true,
    isActive: true,
    createdAt: true,
  } satisfies Prisma.DiscountSelect;

  /**
   * Keep the response key `id` but its value is the UUID `discountId`.
   * The internal numeric auto-increment `id` is never exposed.
   */
  private mapDiscount(discount: any): any {
    if (!discount) return discount;
    const { discountId, ...rest } = discount;
    return { id: discountId, ...rest };
  }

  private async findDiscountOrThrow(discountId: string) {
    const discount = await this.prisma.discount.findFirst({
      where: { discountId, deletedAt: null },
      select: this.discountSelect,
    });

    if (!discount) throwNotFoundException('Discount not found');
    return discount!;
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

  async findAll(query: QueryDiscountDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DiscountWhereInput = {
      deletedAt: null,
      ...(query.search && {
        OR: [
          { name: { contains: query.search } },
          { description: { contains: query.search } },
        ],
      }),
    };

    const [discounts, total] = await this.prisma.$transaction([
      this.prisma.discount.findMany({
        where,
        select: this.discountSelect,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.discount.count({ where }),
    ]);

    return {
      status: true,
      message: 'Discounts fetched successfully.',
      data: discounts.map((discount) => this.mapDiscount(discount)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(discountId: string) {
    const discount = await this.findDiscountOrThrow(discountId);

    return {
      status: true,
      message: 'Discount fetched successfully.',
      data: this.mapDiscount(discount),
    };
  }

  async create(data: CreateDiscountDto, userId?: number) {
    this.validateValue(data.type, data.value);

    try {
      await this.prisma.discount.create({
        data: {
          ...data,
          discountId: randomUUID(),
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

  async update(discountId: string, data: UpdateDiscountDto, userId?: number) {
    await this.findDiscountOrThrow(discountId);

    if (data.type !== undefined && data.value !== undefined) {
      this.validateValue(data.type, data.value);
    }

    try {
      await this.prisma.discount.updateMany({
        where: { discountId, deletedAt: null },
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

  async toggle(discountId: string, data: ToggleDiscountDto, userId?: number) {
    await this.findDiscountOrThrow(discountId);

    try {
      await this.prisma.discount.updateMany({
        where: { discountId, deletedAt: null },
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

  async delete(discountId: string, userId?: number) {
    await this.findDiscountOrThrow(discountId);

    try {
      await this.prisma.discount.updateMany({
        where: { discountId, deletedAt: null },
        data: {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: userId || null,
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
