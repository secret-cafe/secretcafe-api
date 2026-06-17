/*
  Warnings:

  - You are about to drop the column `subMenuItemId` on the `orderitem` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `orderitem` DROP FOREIGN KEY `OrderItem_subMenuItemId_fkey`;

-- DropIndex
DROP INDEX `OrderItem_subMenuItemId_fkey` ON `orderitem`;

-- AlterTable
ALTER TABLE `orderitem` DROP COLUMN `subMenuItemId`;

-- CreateTable
CREATE TABLE `OrderSubMenuItem` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `orderItemId` INTEGER UNSIGNED NOT NULL,
    `subMenuItemId` INTEGER UNSIGNED NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `totalPrice` DECIMAL(10, 2) NOT NULL,
    `notes` VARCHAR(500) NULL,
    `isCancelled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `OrderSubMenuItem_orderItemId_idx`(`orderItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrderSubMenuItem` ADD CONSTRAINT `OrderSubMenuItem_subMenuItemId_fkey` FOREIGN KEY (`subMenuItemId`) REFERENCES `SubMenuItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
