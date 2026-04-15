import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { throwNotFoundException } from '../utils/http-exception.helper';

@Injectable()
export class UserService {
  
  constructor(private prisma: PrismaService) { }

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

    if (!user) throwNotFoundException('User not found');
    return user;
  }

  private async hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }

  async findAll() {
    const users = await this.prisma.userInfo.findMany({
      where: { deletedAt: null },
      select: this.userSelect,
    });

    return {
      status: true,
      message: 'Users fetched successfully',
      data: users,
    };
  }

  async findOne(id: number) {
    const user = await this.findUserOrThrow(id);

    return {
      status: true,
      message: 'User fetched successfully',
      data: user,
    };
  }

  async create(data: CreateUserDto) {
    try {
      // await this.prisma.userInfo.create({
      //   data,
      // });
      const hashedPassword = await this.hashPassword(data.password);
      await this.prisma.userInfo.create({
        data: {
          ...data,
          password: hashedPassword,
        },
      });

      return {
        message: 'User created successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to create user',
        error: (error as Error).message,
      };
    }
  }

  async update(id: number, data: UpdateUserDto) {
    await this.findUserOrThrow(id);

    try {
      if (data.password) {
        data.password = await this.hashPassword(data.password);
      }

      await this.prisma.userInfo.update({
        where: { id },
        data,
      });

      return {
        status: true,
        message: 'User updated successfully',
      };
    } catch (error) {
      return {
        status: false,
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
        status: true,
        message: 'User deleted successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to delete user',
        error: (error as Error).message,
      };
    }
  }
}