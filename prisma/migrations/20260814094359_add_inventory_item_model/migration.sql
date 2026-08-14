-- CreateTable
CREATE TABLE `InventoryItem` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `inventoryId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(100) NOT NULL,
    `unit` VARCHAR(50) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `lowStockThreshold` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` INTEGER UNSIGNED NULL,
    `updatedBy` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `InventoryItem_inventoryId_key`(`inventoryId`),
    UNIQUE INDEX `InventoryItem_sku_key`(`sku`),
    INDEX `InventoryItem_deletedAt_idx`(`deletedAt`),
    INDEX `InventoryItem_inventoryId_idx`(`inventoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
