-- AlterTable
ALTER TABLE `MenuItem` ADD COLUMN `menuId` VARCHAR(36) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `MenuItem_menuId_key` ON `MenuItem`(`menuId`);

-- CreateIndex
CREATE INDEX `MenuItem_menuId_idx` ON `MenuItem`(`menuId`);

-- AlterTable
ALTER TABLE `SubMenuItem` ADD COLUMN `subMenuId` VARCHAR(36) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `SubMenuItem_subMenuId_key` ON `SubMenuItem`(`subMenuId`);

-- CreateIndex
CREATE INDEX `SubMenuItem_subMenuId_idx` ON `SubMenuItem`(`subMenuId`);
