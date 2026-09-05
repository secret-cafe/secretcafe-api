/*
  Warnings:

  - A unique constraint covering the columns `[billingId]` on the table `Billing` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[discountId]` on the table `Discount` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `billing` ADD COLUMN `billingId` VARCHAR(36) NULL,
    ADD COLUMN `updatedBy` INTEGER UNSIGNED NULL;

-- AlterTable
ALTER TABLE `discount` ADD COLUMN `discountId` VARCHAR(36) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Billing_billingId_key` ON `Billing`(`billingId`);

-- CreateIndex
CREATE INDEX `Billing_billingId_idx` ON `Billing`(`billingId`);

-- CreateIndex
CREATE UNIQUE INDEX `Discount_discountId_key` ON `Discount`(`discountId`);

-- CreateIndex
CREATE INDEX `Discount_discountId_idx` ON `Discount`(`discountId`);
