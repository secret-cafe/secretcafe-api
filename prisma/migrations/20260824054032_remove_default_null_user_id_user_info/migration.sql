/*
  Warnings:

  - Made the column `userId` on table `userinfo` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `userinfo` MODIFY `userId` VARCHAR(36) NOT NULL;
