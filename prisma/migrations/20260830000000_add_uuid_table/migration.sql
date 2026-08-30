-- AlterTable
ALTER TABLE `RestaurantTable` ADD COLUMN `tableId` VARCHAR(36) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `RestaurantTable_tableId_key` ON `RestaurantTable`(`tableId`);

-- CreateIndex
CREATE INDEX `RestaurantTable_tableId_idx` ON `RestaurantTable`(`tableId`);