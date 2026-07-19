-- AlterTable
ALTER TABLE `restauranttable` ADD COLUMN `rushMode` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `tablesession` ADD COLUMN `rushMode` BOOLEAN NOT NULL DEFAULT false;
