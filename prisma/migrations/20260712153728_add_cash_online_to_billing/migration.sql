-- AlterTable
ALTER TABLE `billing` ADD COLUMN `cashAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `onlineAmount` DECIMAL(10, 2) NULL,
    MODIFY `paymentMethod` ENUM('CASH', 'UPI', 'CARD', 'CASH_ONLINE') NULL;
