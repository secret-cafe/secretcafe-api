import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  // ✅ DRY: reusable select object
  private readonly userSelect = {
    id: true,
    name: true,
    username: true,
    email: true,
    phoneNumber: true,
    isActive: true,
  };

  // ✅ DRY: reusable method to find user or throw
  private async findUserOrThrow(id: number) {
    const user = await this.prisma.userInfo.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: this.userSelect,
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll() {
    const users = await this.prisma.userInfo.findMany({
      where: { deletedAt: null },
      select: this.userSelect,
    });

    return {
      message: 'Users fetched successfully',
      data: users,
    };
  }

  async findOne(id: number) {
    const user = await this.findUserOrThrow(id);

    return {
      message: 'User fetched successfully',
      data: user,
    };
  }

  async create(data: CreateUserDto) {
    try {
      await this.prisma.userInfo.create({
        data,
      });

      return {
        message: 'User created successfully',
      };
    } catch (error) {
      return {
        message: 'Failed to create user',
        error: (error as Error).message,
      };
    }
  }

  async update(id: number, data: UpdateUserDto) {
    await this.findUserOrThrow(id);

    try {
      await this.prisma.userInfo.update({
        where: { id },
        data,
      });

      return {
        message: 'User updated successfully',
      };
    } catch (error) {
      return {
        message: 'Failed to update user',
        error: (error as Error).message,
      };
    }
  }

  async delete(id: number) {
    await this.findUserOrThrow(id);

    try {
      await this.prisma.userInfo.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      return {
        message: 'User deleted successfully',
      };
    } catch (error) {
      return {
        message: 'Failed to delete user',
        error: (error as Error).message,
      };
    }
  }
}