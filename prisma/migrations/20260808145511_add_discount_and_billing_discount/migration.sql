-- CreateTable
CREATE TABLE `Discount` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` VARCHAR(5000) NULL,
    `type` ENUM('PERCENTAGE', 'AMOUNT') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` INTEGER UNSIGNED NULL,
    `updatedBy` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Discount_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BillingDiscount` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `billingId` INTEGER UNSIGNED NOT NULL,
    `discountId` INTEGER UNSIGNED NOT NULL,
    `discountType` ENUM('PERCENTAGE', 'AMOUNT') NOT NULL,
    `discountValue` DECIMAL(10, 2) NOT NULL,
    `discountAmount` DECIMAL(10, 2) NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BillingDiscount_billingId_idx`(`billingId`),
    INDEX `BillingDiscount_discountId_idx`(`discountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BillingDiscount` ADD CONSTRAINT `BillingDiscount_billingId_fkey` FOREIGN KEY (`billingId`) REFERENCES `Billing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingDiscount` ADD CONSTRAINT `BillingDiscount_discountId_fkey` FOREIGN KEY (`discountId`) REFERENCES `Discount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
