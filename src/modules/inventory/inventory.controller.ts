import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';

@Controller('inventory')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  createInventory(
    @Body() createInventoryDto: CreateInventoryDto,
    @CurrentUser('sub') userId?: number,
  ) {
    return this.inventoryService.create(createInventoryDto, userId);
  }

  @Get()
  getAllInventoryItems(@Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get(':inventoryId')
  getInventoryItemById(
    @Param('inventoryId', ParseUUIDPipe) inventoryId: string,
  ) {
    return this.inventoryService.findOne(inventoryId);
  }

  @Patch(':inventoryId')
  updateInventoryItem(
    @Param('inventoryId', ParseUUIDPipe) inventoryId: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
    @CurrentUser('sub') userId?: number,
  ) {
    return this.inventoryService.update(
      inventoryId,
      updateInventoryDto,
      userId,
    );
  }

  @Delete(':inventoryId')
  deleteInventoryItem(
    @Param('inventoryId', ParseUUIDPipe) inventoryId: string,
  ) {
    return this.inventoryService.delete(inventoryId);
  }
}
