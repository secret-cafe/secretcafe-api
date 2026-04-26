import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UploadedFile } from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { MenuService } from './menu.service';
import { UploadImage } from 'src/common/decorators/upload-image.decorator';
import { ParseJsonPipe } from 'src/common/pipe/parsejson.pipe';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';


@Controller('menu')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class MenuController {
    constructor(private readonly menuService: MenuService) {}

    @Post()
    @UploadImage('imageFile', './uploads/menu')
    createMenu(@Body('data', new ParseJsonPipe(CreateMenuDto)) createMenuDto: any, @UploadedFile() file?: Express.Multer.File) {
        const filePath = file ? `uploads/menu/${file.filename}` : undefined;
        return this.menuService.create(createMenuDto, filePath);
    }

    @Get()
    getAllMenu() {
        return this.menuService.findAll();
    }

    @Get(':id')
    getMenuById(@Param('id', ParseIntPipe) menuId: number) {
        return this.menuService.findOne(menuId);
    }

    @Patch(':id')
    @UploadImage('imageFile', './uploads/menu')
    updateMenu(@Param('id', ParseIntPipe) menuId: number, @Body('data', new ParseJsonPipe(UpdateMenuDto)) updateMenuDto: any, @UploadedFile() file?: Express.Multer.File) {
        const filePath = file ? `uploads/menu/${file.filename}` : undefined;
        return this.menuService.update(menuId, updateMenuDto);
    }

    @Delete(':id')
    deleteMenu(@Param('id', ParseIntPipe) menuId: number) {
        return this.menuService.delete(menuId);
    }
}
