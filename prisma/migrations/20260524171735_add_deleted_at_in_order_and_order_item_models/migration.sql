-- AlterTable
ALTER TABLE `order` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `orderitem` ADD COLUMN `deletedAt` DATETIME(3) NULL;
