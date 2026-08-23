import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { throwNotFoundException } from 'src/common/utils/http-exception.helper';
import * as bcrypt from 'bcrypt';

type UserRaw = {
  userId: string;
  name: string;
  username: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: { roleId: string; name: string } | null;
};

@Injectable()
export class UserService {

  constructor(private prisma: PrismaService) { }

  private readonly userSelect = {
    userId: true,
    name: true,
    username: true,
    email: true,
    phoneNumber: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    role: {
      select: {
        roleId: true,
        name: true,
      },
    },
  } satisfies Prisma.UserInfoSelect;

  private async findUserOrThrow(userId: string) {
    const user = await this.prisma.userInfo.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
      select: this.userSelect,
    });

    if (!user) throwNotFoundException('User not found');
    return user!;
  }

  private async resolveRoleOrThrow(roleId: string) {
    const role = await this.prisma.roles.findFirst({
      where: {
        roleId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!role) throwNotFoundException('Role not found');
    return role!;
  }

  private async hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }

  async findAll(query: QueryUserDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserInfoWhereInput = {
      deletedAt: null,
      ...(query.search && {
        OR: [
          { name: { contains: query.search } },
          { username: { contains: query.search } },
          { email: { contains: query.search } },
        ],
      }),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.userInfo.findMany({
        where,
        select: this.userSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userInfo.count({ where }),
    ]);

    return {
      status: true,
      message: 'Users fetched successfully',
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string) {
    const user = await this.findUserOrThrow(userId);

    return {
      status: true,
      message: 'User fetched successfully',
      data: user,
    };
  }

  async create(data: CreateUserDto, createdById?: number) {
    const role = await this.resolveRoleOrThrow(data.roleId);

    try {
      const hashedPassword = await this.hashPassword(data.password);
      await this.prisma.userInfo.create({
        data: {
          userId: randomUUID(),
          name: data.name,
          username: data.username,
          email: data.email,
          password: hashedPassword,
          phoneNumber: data.phoneNumber ?? null,
          isActive: data.isActive ?? true,
          roleId: role.id,
          createdBy: createdById ?? null,
        },
      });

      return {
        status: true,
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

  async update(userId: string, data: UpdateUserDto, updatedById?: number) {
    await this.findUserOrThrow(userId);

    let roleId: number | undefined;
    if (data.roleId) {
      const role = await this.resolveRoleOrThrow(data.roleId);
      roleId = role.id;
    }

    try {
      let password: string | undefined;
      if (data.password) {
        password = await this.hashPassword(data.password);
      }

      const updateData: any = {
        ...data,
        ...(data.password !== undefined && { password }),
        ...(data.roleId !== undefined && { roleId }),
        updatedBy: updatedById ?? null,
      };

      await this.prisma.userInfo.updateMany({
        where: {
          userId,
          deletedAt: null,
        },
        data: updateData,
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

  async delete(userId: string, updatedById?: number) {
    await this.findUserOrThrow(userId);

    try {
      await this.prisma.userInfo.updateMany({
        where: {
          userId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: updatedById ?? null,
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