-- CreateTable
CREATE TABLE `ApplicationLog` (
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
    `durationMs` INTEGER NULL,
    `error` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApplicationLog_logId_key`(`logId`),
    INDEX `ApplicationLog_createdAt_idx`(`createdAt`),
    INDEX `ApplicationLog_moduleName_idx`(`moduleName`),
    INDEX `ApplicationLog_path_idx`(`path`),
    INDEX `ApplicationLog_statusCode_idx`(`statusCode`),
    INDEX `ApplicationLog_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
