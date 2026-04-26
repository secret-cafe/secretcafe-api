import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

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

  async seed() {
    try {
      const roles = [
        { name: "Super Admin", description: "Full system access" },
        { name: "Admin", description: "Administrative access" },
        { name: "Chef", description: "Kitchen staff" },
        { name: "Waiter", description: "Service staff" },
        { name: "Customer", description: "End user" },
      ];

      for (const role of roles) {
        const res = await this.prisma.roles.upsert({
          where: { name: role.name },
          update: { description: role.description },
          create: role,
        });
      }

      return {
        success: true,
        message: "Seeding completed",
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        error: "Seeding failed",
      };
    }
  }
}