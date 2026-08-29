import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile } from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { MenuService } from './menu.service';
import { UploadImage } from 'src/common/decorators/upload-image.decorator';
import { ParseJsonPipe } from 'src/common/pipe/parsejson.pipe';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { QueryMenuDto } from './dto/query-menu.dto';

@Controller('menu')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class MenuController {
    constructor(private readonly menuService: MenuService) { }

    @Post()
    @UploadImage('menu')
    createMenu(
        @Body('data', new ParseJsonPipe(CreateMenuDto)) createMenuDto: any,
        @CurrentUser('userId') userId?: number,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        return this.menuService.create(createMenuDto, file, userId);
    }

    @Get()
    getAllMenu(@Query() query: QueryMenuDto) {
        return this.menuService.findAll(query);
    }

    @Get('category/:id')
    getMenuByCategoryId(@Param('id', ParseUUIDPipe) categoryId: string) {
        return this.menuService.findByCategory(categoryId);
    }

    @Get(':menuId')
    getMenuById(@Param('menuId', ParseUUIDPipe) menuId: string) {
        return this.menuService.findOne(menuId);
    }

    @Patch(':menuId')
    @UploadImage('menu')
    updateMenu(
        @Param('menuId', ParseUUIDPipe) menuId: string,
        @Body('data', new ParseJsonPipe(UpdateMenuDto)) updateMenuDto: any,
        @CurrentUser('userId') updatedById?: number,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        return this.menuService.update(menuId, updateMenuDto, file, updatedById);
    }

    @Delete(':menuId')
    deleteMenu(
        @Param('menuId', ParseUUIDPipe) menuId: string,
        @CurrentUser('userId') updatedById?: number,
    ) {
        return this.menuService.delete(menuId, updatedById);
    }
}
