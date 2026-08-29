import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { SubmenuService } from './submenu.service';
import { CreateSubMenuItemDto, UpdateSubMenuItemDto } from './dto/submenu.dto';
import { QuerySubMenuDto } from './dto/query-submenu.dto';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('submenu')
export class SubmenuController {
  constructor(private readonly submenuService: SubmenuService) {}

  @Post()
  @Auth(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() dto: CreateSubMenuItemDto, @CurrentUser('userId') userId?: number) {
    return this.submenuService.create(dto, userId);
  }

  @Get()
  findAll(@Query() query: QuerySubMenuDto) {
    return this.submenuService.findAll(query);
  }

  @Get(':subMenuId')
  findOne(@Param('subMenuId', ParseUUIDPipe) subMenuId: string) {
    return this.submenuService.findOne(subMenuId);
  }

  @Patch(':subMenuId')
  @Auth(Role.SUPER_ADMIN, Role.ADMIN)
  update(
    @Param('subMenuId', ParseUUIDPipe) subMenuId: string,
    @Body() dto: UpdateSubMenuItemDto,
    @CurrentUser('userId') updatedById?: number,
  ) {
    return this.submenuService.update(subMenuId, dto, updatedById);
  }

  @Delete(':subMenuId')
  @Auth(Role.SUPER_ADMIN, Role.ADMIN)
  delete(
    @Param('subMenuId', ParseUUIDPipe) subMenuId: string,
    @CurrentUser('userId') updatedById?: number,
  ) {
    return this.submenuService.delete(subMenuId, updatedById);
  }
}
