import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { TableType } from 'generated/prisma/enums';

@Injectable()
export class SeedService {
    constructor(private readonly prisma: PrismaService) { }

    async seed() {
        try {

            // #region - Roles Seeder
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
                    create: {
                        ...role,
                        roleId: randomUUID(),
                    },
                });
            }

            // #endregion =================================================

            // #region - UserInfo Seeder
            const hashedPassword = await bcrypt.hash("123456", 10);

            const defaultUsers = [
                {
                    role: "Super Admin",
                    name: "Super Admin",
                    username: "super.admin",
                    email: "super.admin@gmail.com",
                    password: hashedPassword,
                    phoneNumber: "9999999999",
                    isActive: true,
                },
                {
                    role: "Admin",
                    name: "Admin",
                    username: "admin",
                    email: "admin@gmail.com",
                    password: hashedPassword,
                    phoneNumber: "9999999998",
                    isActive: true,
                },
                {
                    role: "Chef",
                    name: "Chef",
                    username: "chef",
                    email: "chef@gmail.com",
                    password: hashedPassword,
                    phoneNumber: "9999999997",
                    isActive: true,
                },
                {
                    role: "Waiter",
                    name: "Waiter",
                    username: "waiter",
                    email: "waiter@gmail.com",
                    password: hashedPassword,
                    phoneNumber: "9999999996",
                    isActive: true,
                },
            ];

            for (const user of defaultUsers) {

                const { role: roleName, ...userData } = user;

                const role = await this.prisma.roles.findUnique({
                    where: { name: roleName },
                });

                if (!role) continue;

                await this.prisma.userInfo.create({
                    data: {
                        ...userData,
                        userId: randomUUID(),
                        roleId: role.id,
                    },
                });
            }

            // #endregion ========================================

            // #region - Table Seeder
            const tables = [
                { name: "F-1", type: TableType.FAMILY, capacity: 4 },
                { name: "F-2", type: TableType.FAMILY, capacity: 4 },
                { name: "F-3", type: TableType.FAMILY, capacity: 4 },
                { name: "F-4", type: TableType.FAMILY, capacity: 4 },
                { name: "P-1", type: TableType.POD, capacity: 4 },
                { name: "P-2", type: TableType.POD, capacity: 2 },
                { name: "H-1", type: TableType.HALL, capacity: 10 },
                { name: "H-2", type: TableType.HALL, capacity: 15 },
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

            // #endregion ==================================================

            // #region - Categories seeder
            const categories = [
                {
                    name: "Burgers",
                    description: "Veg, chicken and premium burgers",
                },
                {
                    name: "Pizza",
                    description: "Hand tossed pizzas",
                },
                {
                    name: "Sandwiches",
                    description: "Grilled and cold sandwiches",
                },
                {
                    name: "Wraps",
                    description: "Fresh wraps and rolls",
                },
                {
                    name: "Pasta",
                    description: "Creamy and tomato based pasta",
                },
                {
                    name: "Fries",
                    description: "Loaded fries and sides",
                },
                {
                    name: "Starters",
                    description: "Snacks and appetizers",
                },
                {
                    name: "Salads",
                    description: "Healthy salads",
                },
                {
                    name: "Rice Bowls",
                    description: "Rice meals",
                },
                {
                    name: "Desserts",
                    description: "Sweet treats",
                },
                {
                    name: "Coffee",
                    description: "Hot coffee",
                },
                {
                    name: "Tea",
                    description: "Tea and chai",
                },
                {
                    name: "Cold Beverages",
                    description: "Cold drinks and coolers",
                },
                {
                    name: "Milkshakes",
                    description: "Premium milkshakes",
                },
                {
                    name: "Smoothies",
                    description: "Fruit smoothies",
                },
            ];

            const categoryMap: Record<string, number> = {};

            for (const category of categories) {
                let record = await this.prisma.category.findFirst({
                    where: { name: category.name },
                });

                if (!record) {
                    record = await this.prisma.category.create({
                        data: {
                            ...category,
                            categoryId: randomUUID(),
                        },
                    });
                }

                categoryMap[category.name] = record.id;
            }

            // #endregion =========================================

            // #region - Menus & Submenus seeder
            const menus = [
                // ---------------- Burgers ----------------
                {
                    category: "Burgers",
                    name: "Veg Cheese Burger",
                    price: 149,
                    menuType: "Veg",
                    description: "Veg patty with cheese and fresh vegetables.",
                    publicId: "menu/1783830337368-241eeaf5-9cb1-4429-9860-f635f11e033a",
                    imageUrl: "https://res.cloudinary.com/djrclalf9/image/upload/v1783830342/menu/1783830337368-241eeaf5-9cb1-4429-9860-f635f11e033a.jpg",
                    available: true,
                    submenu: [
                        { name: "Extra Cheese", price: 25, description: "Cheese slice" },
                        { name: "Extra Patty", price: 50, description: "Additional patty" },
                        { name: "French Fries", price: 79, description: "Regular fries" },
                    ],
                },
                {
                    category: "Burgers",
                    name: "Paneer Burger",
                    price: 179,
                    menuType: "Veg",
                    description: "Grilled paneer burger.",
                    publicId: "menu/1783830509485-d85188fe-a8ae-498a-a1bf-7d20f59aad04",
                    imageUrl: "https://res.cloudinary.com/djrclalf9/image/upload/v1783830512/menu/1783830509485-d85188fe-a8ae-498a-a1bf-7d20f59aad04.jpg",
                    available: true,
                    submenu: [
                        { name: "Extra Cheese", price: 25, description: "Cheese slice" },
                        { name: "Extra Sauce", price: 15, description: "Burger sauce" },
                    ],
                },
                {
                    category: "Burgers",
                    name: "Chicken Burger",
                    price: 219,
                    menuType: "NonVeg",
                    description: "Juicy grilled chicken burger.",
                    publicId: "menu/1783830587213-9bd56d31-caab-440e-8778-623ff89b508b",
                    imageUrl: "https://res.cloudinary.com/djrclalf9/image/upload/v1783830588/menu/1783830587213-9bd56d31-caab-440e-8778-623ff89b508b.jpg",
                    available: true,
                    submenu: [
                        { name: "Extra Chicken", price: 70, description: "Chicken fillet" },
                        { name: "Cheese", price: 25, description: "Cheese slice" },
                    ],
                },

                // ---------------- Pizza ----------------
                {
                    category: "Pizza",
                    name: "Margherita Pizza",
                    price: 249,
                    menuType: "Veg",
                    description: "Classic cheese pizza.",
                    publicId: "menu/1783830702581-2d16bb72-e9f4-4456-9048-01f5a7c7c71c",
                    imageUrl: "https://res.cloudinary.com/djrclalf9/image/upload/v1783830708/menu/1783830702581-2d16bb72-e9f4-4456-9048-01f5a7c7c71c.jpg",
                    available: true,
                    submenu: [
                        { name: "Extra Cheese", price: 40, description: "Mozzarella" },
                        { name: "Olives", price: 30, description: "Black olives" },
                        { name: "Jalapenos", price: 30, description: "Jalapenos" },
                    ],
                },
                {
                    category: "Pizza",
                    name: "Farm Fresh Pizza",
                    price: 329,
                    menuType: "Veg",
                    description: "Loaded with vegetables.",
                    publicId: "menu/1783830794841-91303c67-8fce-43e1-a318-dddf50010036",
                    imageUrl: "https://res.cloudinary.com/djrclalf9/image/upload/v1783830798/menu/1783830794841-91303c67-8fce-43e1-a318-dddf50010036.jpg",
                    available: true,
                    submenu: [
                        { name: "Extra Cheese", price: 40, description: "Cheese" },
                        { name: "Mushrooms", price: 35, description: "Fresh mushrooms" },
                    ],
                },
                {
                    category: "Pizza",
                    name: "Chicken Pepperoni Pizza",
                    price: 399,
                    menuType: "NonVeg",
                    description: "Chicken pepperoni pizza.",
                    publicId: "menu/1783830894059-15eb42d2-b9d7-408f-9414-4f342082d9bc",
                    imageUrl: "https://res.cloudinary.com/djrclalf9/image/upload/v1783830917/menu/1783830894059-15eb42d2-b9d7-408f-9414-4f342082d9bc.jpg",
                    available: true,
                    submenu: [
                        { name: "Extra Pepperoni", price: 70, description: "Pepperoni" },
                        { name: "Extra Cheese", price: 40, description: "Cheese" },
                    ],
                },

                // ---------------- Sandwiches ----------------
                {
                    category: "Sandwiches",
                    name: "Veg Grilled Sandwich",
                    price: 149,
                    menuType: "Veg",
                    description: "Grilled vegetable sandwich.",
                    available: true,
                    submenu: [
                        { name: "Cheese", price: 20, description: "Extra cheese" },
                        { name: "French Fries", price: 79, description: "Side fries" },
                    ],
                },
                {
                    category: "Sandwiches",
                    name: "Club Sandwich",
                    price: 249,
                    menuType: "NonVeg",
                    description: "Triple layer chicken club sandwich.",
                    available: true,
                    submenu: [
                        { name: "Extra Chicken", price: 60, description: "Chicken" },
                    ],
                },

                // ---------------- Wraps ----------------
                {
                    category: "Wraps",
                    name: "Paneer Wrap",
                    price: 189,
                    menuType: "Veg",
                    description: "Paneer tikka wrap.",
                    available: true,
                    submenu: [
                        { name: "Extra Paneer", price: 50, description: "Paneer filling" },
                    ],
                },
                {
                    category: "Wraps",
                    name: "Chicken Wrap",
                    price: 229,
                    menuType: "NonVeg",
                    description: "Grilled chicken wrap.",
                    available: true,
                    submenu: [
                        { name: "Extra Chicken", price: 60, description: "Chicken" },
                    ],
                },

                // ---------------- Pasta ----------------
                {
                    category: "Pasta",
                    name: "White Sauce Pasta",
                    price: 259,
                    menuType: "Veg",
                    description: "Creamy white sauce pasta.",
                    available: true,
                    submenu: [
                        { name: "Extra Cheese", price: 30, description: "Cheese" },
                        { name: "Mushrooms", price: 35, description: "Mushrooms" },
                    ],
                },
                {
                    category: "Pasta",
                    name: "Chicken Alfredo Pasta",
                    price: 329,
                    menuType: "NonVeg",
                    description: "Creamy chicken pasta.",
                    available: true,
                    submenu: [
                        { name: "Extra Chicken", price: 60, description: "Chicken" },
                    ],
                },

                // ---------------- Fries ----------------
                {
                    category: "Fries",
                    name: "Peri Peri Fries",
                    price: 119,
                    menuType: "Veg",
                    description: "Crispy fries with peri peri seasoning.",
                    available: true,
                    submenu: [
                        { name: "Cheese Dip", price: 30, description: "Cheese dip" },
                        { name: "Mayo Dip", price: 20, description: "Mayonnaise" },
                    ],
                },
                {
                    category: "Fries",
                    name: "Loaded Cheese Fries",
                    price: 179,
                    menuType: "Veg",
                    description: "Cheese loaded fries.",
                    available: true,
                    submenu: [
                        { name: "Extra Cheese", price: 30, description: "Cheese" },
                        { name: "Jalapenos", price: 25, description: "Jalapenos" },
                    ],
                },

                // ---------------- Starters ----------------
                {
                    category: "Starters",
                    name: "Garlic Bread",
                    price: 149,
                    menuType: "Veg",
                    description: "Classic garlic bread.",
                    available: true,
                    submenu: [
                        { name: "Cheese", price: 25, description: "Cheese topping" },
                    ],
                },
                {
                    category: "Starters",
                    name: "Chicken Wings",
                    price: 299,
                    menuType: "NonVeg",
                    description: "Spicy chicken wings.",
                    available: true,
                    submenu: [
                        { name: "BBQ Sauce", price: 20, description: "BBQ dip" },
                    ],
                },

                // ---------------- Salads ----------------
                {
                    category: "Salads",
                    name: "Caesar Salad",
                    price: 249,
                    menuType: "Veg",
                    description: "Fresh Caesar salad.",
                    available: true,
                    submenu: [
                        { name: "Extra Dressing", price: 20, description: "Caesar dressing" },
                    ],
                },

                // ---------------- Rice ----------------
                {
                    category: "Rice Bowls",
                    name: "Veg Fried Rice",
                    price: 199,
                    menuType: "Veg",
                    description: "Veg fried rice.",
                    available: true,
                    submenu: [
                        { name: "Extra Gravy", price: 40, description: "Manchurian gravy" },
                    ],
                },
                {
                    category: "Rice Bowls",
                    name: "Chicken Fried Rice",
                    price: 249,
                    menuType: "NonVeg",
                    description: "Chicken fried rice.",
                    available: true,
                    submenu: [
                        { name: "Extra Chicken", price: 60, description: "Chicken" },
                    ],
                },

                // ---------------- Desserts ----------------
                {
                    category: "Desserts",
                    name: "Chocolate Brownie",
                    price: 139,
                    menuType: "Veg",
                    description: "Warm chocolate brownie.",
                    available: true,
                    submenu: [
                        { name: "Vanilla Ice Cream", price: 49, description: "Ice cream scoop" },
                    ],
                },
                {
                    category: "Desserts",
                    name: "Cheesecake",
                    price: 189,
                    menuType: "Veg",
                    description: "New York cheesecake.",
                    available: true,
                    submenu: [
                        { name: "Chocolate Syrup", price: 20, description: "Chocolate topping" },
                    ],
                },

                // ---------------- Coffee ----------------
                {
                    category: "Coffee",
                    name: "Cappuccino",
                    price: 169,
                    menuType: "Veg",
                    description: "Fresh cappuccino.",
                    available: true,
                    submenu: [
                        { name: "Extra Shot", price: 35, description: "Espresso shot" },
                        { name: "Soy Milk", price: 30, description: "Soy milk" },
                    ],
                },
                {
                    category: "Coffee",
                    name: "Cafe Latte",
                    price: 179,
                    menuType: "Veg",
                    description: "Creamy latte.",
                    available: true,
                    submenu: [
                        { name: "Vanilla Syrup", price: 25, description: "Vanilla" },
                    ],
                },

                // ---------------- Tea ----------------
                {
                    category: "Tea",
                    name: "Masala Chai",
                    price: 79,
                    menuType: "Veg",
                    description: "Traditional Indian tea.",
                    available: true,
                    submenu: [
                        { name: "Extra Ginger", price: 10, description: "Fresh ginger" },
                    ],
                },
                {
                    category: "Tea",
                    name: "Green Tea",
                    price: 99,
                    menuType: "Veg",
                    description: "Healthy green tea.",
                    available: true,
                    submenu: [],
                },

                // ---------------- Cold Drinks ----------------
                {
                    category: "Cold Beverages",
                    name: "Fresh Lime Soda",
                    price: 99,
                    menuType: "Veg",
                    description: "Sweet or salted.",
                    available: true,
                    submenu: [
                        { name: "Mint", price: 15, description: "Fresh mint" },
                    ],
                },
                {
                    category: "Cold Beverages",
                    name: "Iced Tea",
                    price: 129,
                    menuType: "Veg",
                    description: "Refreshing iced tea.",
                    available: true,
                    submenu: [
                        { name: "Lemon", price: 10, description: "Extra lemon" },
                    ],
                },

                // ---------------- Milkshakes ----------------
                {
                    category: "Milkshakes",
                    name: "Chocolate Milkshake",
                    price: 199,
                    menuType: "Veg",
                    description: "Rich chocolate shake.",
                    available: true,
                    submenu: [
                        { name: "Whipped Cream", price: 20, description: "Fresh cream" },
                        { name: "Ice Cream Scoop", price: 40, description: "Vanilla scoop" },
                    ],
                },
                {
                    category: "Milkshakes",
                    name: "Oreo Milkshake",
                    price: 219,
                    menuType: "Veg",
                    description: "Oreo cookies blended with milk.",
                    available: true,
                    submenu: [
                        { name: "Extra Oreo", price: 30, description: "Extra cookies" },
                    ],
                },

                // ---------------- Smoothies ----------------
                {
                    category: "Smoothies",
                    name: "Mango Smoothie",
                    price: 189,
                    menuType: "Veg",
                    description: "Fresh mango smoothie.",
                    available: true,
                    submenu: [
                        { name: "Protein Powder", price: 60, description: "Protein scoop" },
                    ],
                },
                {
                    category: "Smoothies",
                    name: "Berry Smoothie",
                    price: 219,
                    menuType: "Veg",
                    description: "Mixed berry smoothie.",
                    available: true,
                    submenu: [
                        { name: "Chia Seeds", price: 20, description: "Healthy topping" },
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
                            menuId: randomUUID(),
                            categoryId: categoryMap[menu.category],
                            name: menu.name,
                            price: menu.price,
                            menuType: menu.menuType,
                            description: menu.description,
                            available: menu.available,
                            publicId: menu.publicId,
                            imageUrl: menu.imageUrl,
                        },
                    });
                }

                for (const sub of menu.submenu) {
                    // Find or create a standalone SubMenuItem by name
                    let subMenuItem = await this.prisma.subMenuItem.findFirst({
                        where: {
                            name: sub.name,
                            deletedAt: null,
                        },
                    });

                    if (!subMenuItem) {
                        subMenuItem = await this.prisma.subMenuItem.create({
                            data: {
                                subMenuId: randomUUID(),
                                name: sub.name,
                                price: sub.price,
                                available: true,
                                description: sub.description,
                            },
                        });
                    }

                    // Link the SubMenuItem to the MenuItem via MenuSubMenu junction
                    const linkExists = await this.prisma.menuSubMenu.findFirst({
                        where: {
                            menuItemId: menuItem.id,
                            subMenuItemId: subMenuItem.id,
                            deletedAt: null,
                        },
                    });

                    if (!linkExists) {
                        await this.prisma.menuSubMenu.create({
                            data: {
                                menuItemId: menuItem.id,
                                subMenuItemId: subMenuItem.id,
                            },
                        });
                    }
                }
            }

            // #endregion =================================================

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