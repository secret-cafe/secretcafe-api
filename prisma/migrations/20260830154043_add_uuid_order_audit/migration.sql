/*
  Warnings:

  - A unique constraint covering the columns `[orderId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderItemId]` on the table `OrderItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderSubMenuItemId]` on the table `OrderSubMenuItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `order` ADD COLUMN `createdBy` INTEGER UNSIGNED NULL,
    ADD COLUMN `orderId` VARCHAR(36) NULL,
    ADD COLUMN `updatedBy` INTEGER UNSIGNED NULL;

-- AlterTable
ALTER TABLE `orderitem` ADD COLUMN `createdBy` INTEGER UNSIGNED NULL,
    ADD COLUMN `orderItemId` VARCHAR(36) NULL,
    ADD COLUMN `updatedBy` INTEGER UNSIGNED NULL;

-- AlterTable
ALTER TABLE `ordersubmenuitem` ADD COLUMN `createdBy` INTEGER UNSIGNED NULL,
    ADD COLUMN `orderSubMenuItemId` VARCHAR(36) NULL,
    ADD COLUMN `updatedBy` INTEGER UNSIGNED NULL;

-- Backfill UUIDs for existing rows so they remain resolvable via the public API.
UPDATE `order` SET `orderId` = UUID() WHERE `orderId` IS NULL;
UPDATE `orderitem` SET `orderItemId` = UUID() WHERE `orderItemId` IS NULL;
UPDATE `ordersubmenuitem` SET `orderSubMenuItemId` = UUID() WHERE `orderSubMenuItemId` IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Order_orderId_key` ON `Order`(`orderId`);

-- CreateIndex
CREATE INDEX `Order_orderId_idx` ON `Order`(`orderId`);

-- CreateIndex
CREATE UNIQUE INDEX `OrderItem_orderItemId_key` ON `OrderItem`(`orderItemId`);

-- CreateIndex
CREATE INDEX `OrderItem_orderItemId_idx` ON `OrderItem`(`orderItemId`);

-- CreateIndex
CREATE UNIQUE INDEX `OrderSubMenuItem_orderSubMenuItemId_key` ON `OrderSubMenuItem`(`orderSubMenuItemId`);

-- CreateIndex
CREATE INDEX `OrderSubMenuItem_orderSubMenuItemId_idx` ON `OrderSubMenuItem`(`orderSubMenuItemId`);
