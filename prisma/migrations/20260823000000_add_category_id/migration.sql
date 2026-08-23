-- AlterTable
ALTER TABLE `category` ADD COLUMN `categoryId` VARCHAR(36) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Category_categoryId_key` ON `Category`(`categoryId`);

-- CreateIndex
CREATE INDEX `Category_categoryId_idx` ON `Category`(`categoryId`);