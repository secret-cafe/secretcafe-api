import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { TableType } from 'generated/prisma/enums';

@Injectable()
export class RoleService {

  constructor(private prisma: PrismaService) { }

  private readonly userSelect = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
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
      // ==========================
      // ROLES
      // ==========================
      const roles = [
        { name: "Super Admin", description: "Full system access" },
        { name: "Admin", description: "Administrative access" },
        { name: "Chef", description: "Kitchen staff" },
        { name: "Waiter", description: "Service staff" },
        { name: "Customer", description: "End user" },
      ];

      for (const role of roles) {
        await this.prisma.roles.upsert({
          where: { name: role.name },
          update: {
            description: role.description,
          },
          create: role,
        });
      }

      // ==========================
      // SUPER ADMIN
      // ==========================
      const hashedPassword = await bcrypt.hash("123456", 10);

      const superAdminRole = await this.prisma.roles.findUnique({
        where: { name: "Super Admin" },
      });

      const adminUser = {
        name: "Super Admin",
        username: "super.admin",
        email: "super.admin@gmail.com",
        password: hashedPassword,
        phoneNumber: "9999999999",
        roleId: superAdminRole!.id,
        isActive: true,
      };

      await this.prisma.userInfo.upsert({
        where: {
          id: 1,
        },
        update: adminUser,
        create: adminUser
      });

      // ==========================
      // TABLES
      // ==========================
      const tables = [
        { name: "F-1", type: TableType.FAMILY, capacity: 4 },
        { name: "F-2", type: TableType.FAMILY, capacity: 4 },
      ];

      for (const table of tables) {
        const exists = await this.prisma.restaurantTable.findFirst({
          where: { name: table.name },
        });

        if (!exists) {
          await this.prisma.restaurantTable.create({
            data: {
              ...table,
              tableStatus: "AVAILABLE",
              isActive: true,
            },
          });
        }
      }

      // ==========================
      // CATEGORIES
      // ==========================
      const categories = [
        {
          name: "Burgers",
          description: "All types of Burgers",
        },
        {
          name: "Pizza",
          description: "All types of Pizza",
        },
      ];

      const categoryMap: Record<string, number> = {};

      for (const category of categories) {
        let record = await this.prisma.category.findFirst({
          where: { name: category.name },
        });

        if (!record) {
          record = await this.prisma.category.create({
            data: category,
          });
        }

        categoryMap[category.name] = record.id;
      }

      // ==========================
      // MENUS + SUBMENUS
      // ==========================
      const menus = [
        {
          category: "Burgers",
          name: "Veg Cheese Burger",
          price: 129.25,
          menuType: "Veg",
          description:
            "Veg cheese Burger with some sauces and toppings.",
          available: true,
          submenu: [
            {
              name: "Extra Cheese",
              price: 4.5,
              description: "Extra cheese",
            },
          ],
        },
        {
          category: "Pizza",
          name: "Veg Cheese Pizza",
          price: 119.0,
          menuType: "Veg",
          description:
            "Veg cheese Pizza with some sauces and toppings.",
          available: true,
          submenu: [
            {
              name: "Extra Cheese",
              price: 4.5,
              description: "Extra cheese",
            },
          ],
        },
      ];

      for (const menu of menus) {
        let menuItem = await this.prisma.menuItem.findFirst({
          where: {
            name: menu.name,
          },
        });

        if (!menuItem) {
          menuItem = await this.prisma.menuItem.create({
            data: {
              categoryId: categoryMap[menu.category],
              name: menu.name,
              price: menu.price,
              menuType: menu.menuType,
              description: menu.description,
              available: menu.available,
            },
          });
        }

        for (const sub of menu.submenu) {
          const exists = await this.prisma.subMenuItem.findFirst({
            where: {
              menuId: menuItem.id,
              name: sub.name,
            },
          });

          if (!exists) {
            await this.prisma.subMenuItem.create({
              data: {
                menuId: menuItem.id,
                name: sub.name,
                price: sub.price,
                available: true,
                description: sub.description,
              },
            });
          }
        }
      }

      return {
        success: true,
        message: "Database seeded successfully",
      };
    } catch (error) {
      console.error(error);

      return {
        success: false,
        message: "Seeding failed",
        error,
      };
    }
  }
}