-- AlterTable
ALTER TABLE `category` ADD COLUMN `imageUrl` VARCHAR(191) NULL,
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `menuitem` MODIFY `imageUrl` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `submenuitem` MODIFY `imageUrl` VARCHAR(191) NULL;
