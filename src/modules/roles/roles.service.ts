import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RoleService {

  constructor(private prisma: PrismaService) { }

  private readonly roleSelect = {
    roleId: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.RolesSelect;

  async findAll() {
    const roles = await this.prisma.roles.findMany({
      where: { deletedAt: null },
      select: this.roleSelect,
      orderBy: { createdAt: 'asc' },
    });

    return {
      status: true,
      message: 'Roles fetched successfully',
      data: roles,
    };
  }
}