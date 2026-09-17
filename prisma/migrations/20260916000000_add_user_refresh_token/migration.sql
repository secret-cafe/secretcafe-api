-- AlterTable
ALTER TABLE `userinfo` ADD COLUMN `refreshTokenHash` VARCHAR(64) NULL,
ADD COLUMN `refreshTokenExpiresAt` DATETIME(3) NULL;