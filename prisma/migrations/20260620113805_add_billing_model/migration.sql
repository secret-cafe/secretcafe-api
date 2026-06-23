-- CreateTable
CREATE TABLE `Billing` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER UNSIGNED NOT NULL,
    `orderId` INTEGER UNSIGNED NULL,
    `billNumber` VARCHAR(50) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `taxAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `serviceCharge` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `paymentStatus` ENUM('UNPAID', 'PAID', 'PARTIAL', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
    `paymentMethod` ENUM('CASH', 'UPI', 'CARD') NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdBy` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Billing_billNumber_key`(`billNumber`),
    INDEX `Billing_sessionId_idx`(`sessionId`),
    INDEX `Billing_paymentStatus_idx`(`paymentStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Billing` ADD CONSTRAINT `Billing_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TableSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Billing` ADD CONSTRAINT `Billing_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
