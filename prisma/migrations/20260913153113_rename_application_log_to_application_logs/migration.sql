/*
  Warnings:

  - You are about to drop the `applicationlog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `applicationlog`;

-- CreateTable
CREATE TABLE `ApplicationLogs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `logId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NULL,
    `moduleName` VARCHAR(191) NULL,
    `method` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `statusCode` INTEGER NULL,
    `requestHeaders` JSON NULL,
    `requestBody` JSON NULL,
    `responseBody` JSON NULL,
    `ip` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdBy` INTEGER UNSIGNED NULL,
    `durationMs` INTEGER NULL,
    `error` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApplicationLogs_logId_key`(`logId`),
    INDEX `ApplicationLogs_createdBy_idx`(`createdBy`),
    INDEX `ApplicationLogs_createdAt_idx`(`createdAt`),
    INDEX `ApplicationLogs_moduleName_idx`(`moduleName`),
    INDEX `ApplicationLogs_path_idx`(`path`),
    INDEX `ApplicationLogs_statusCode_idx`(`statusCode`),
    INDEX `ApplicationLogs_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
