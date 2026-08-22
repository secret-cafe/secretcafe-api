/*
  Warnings:

  - A unique constraint covering the columns `[roleId]` on the table `Roles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `UserInfo` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `roles` ADD COLUMN `roleId` VARCHAR(36) NULL;

-- AlterTable
ALTER TABLE `userinfo` ADD COLUMN `userId` VARCHAR(36) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Roles_roleId_key` ON `Roles`(`roleId`);

-- CreateIndex
CREATE INDEX `Roles_roleId_idx` ON `Roles`(`roleId`);

-- CreateIndex
CREATE UNIQUE INDEX `UserInfo_userId_key` ON `UserInfo`(`userId`);

-- CreateIndex
CREATE INDEX `UserInfo_userId_idx` ON `UserInfo`(`userId`);
