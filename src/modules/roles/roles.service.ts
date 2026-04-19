import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoleService {
  
  constructor(private prisma: PrismaService) { }

  private readonly userSelect = {
    id: true,
    name: true,
    description: true,
    isActive: true,
  };

  async findAll() {
    const roles = await this.prisma.roles.findMany({
      where: { deletedAt: null },
      select: this.userSelect,
    });

    return {
      status: true,
      message: 'Roles fetched successfully',
      data: roles,
    };
  }
}