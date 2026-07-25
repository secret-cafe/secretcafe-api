import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { SubmenuService } from './submenu.service';
import { CreateSubMenuItemDto, UpdateSubMenuItemDto } from './dto/submenu.dto';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';

@Controller('submenu')
export class SubmenuController {
  constructor(private readonly submenuService: SubmenuService) {}

  @Post()
  @Auth(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() dto: CreateSubMenuItemDto) {
    return this.submenuService.create(dto);
  }

  @Get()
  findAll() {
    return this.submenuService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.submenuService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.SUPER_ADMIN, Role.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubMenuItemDto) {
    return this.submenuService.update(id, dto);
  }

  @Delete(':id')
  @Auth(Role.SUPER_ADMIN, Role.ADMIN)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.submenuService.delete(id);
  }
}