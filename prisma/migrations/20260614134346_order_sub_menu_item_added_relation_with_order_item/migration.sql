-- AddForeignKey
ALTER TABLE `OrderSubMenuItem` ADD CONSTRAINT `OrderSubMenuItem_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
