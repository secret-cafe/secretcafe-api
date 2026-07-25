/*
  Warnings:

  - You are about to drop the column `menuId` on the `submenuitem` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `submenuitem` DROP FOREIGN KEY `SubMenuItem_menuId_fkey`;

-- DropIndex
DROP INDEX `SubMenuItem_menuId_idx` ON `submenuitem`;

-- AlterTable
ALTER TABLE `submenuitem` DROP COLUMN `menuId`;

-- CreateTable
CREATE TABLE `MenuSubMenu` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `menuItemId` INTEGER UNSIGNED NOT NULL,
    `subMenuItemId` INTEGER UNSIGNED NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` INTEGER UNSIGNED NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` INTEGER UNSIGNED NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `MenuSubMenu_menuItemId_idx`(`menuItemId`),
    INDEX `MenuSubMenu_subMenuItemId_idx`(`subMenuItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MenuSubMenu` ADD CONSTRAINT `MenuSubMenu_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuSubMenu` ADD CONSTRAINT `MenuSubMenu_subMenuItemId_fkey` FOREIGN KEY (`subMenuItemId`) REFERENCES `SubMenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
