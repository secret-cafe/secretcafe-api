import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UploadedFile } from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UploadImage } from 'src/common/decorators/upload-image.decorator';

@Controller('category')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Post()
    @UploadImage('category')
    createCategory(@Body() createCategoryDto: CreateCategoryDto, @UploadedFile() file?: Express.Multer.File) {
        return this.categoryService.create(createCategoryDto, file);
    }

    @Get()
    getAllCategories() {
        return this.categoryService.findAll();
    }

    @Get(':id')
    getCategoryById(@Param('id', ParseIntPipe) categoryId: number) {
        return this.categoryService.findOne(categoryId);
    }

    @Patch(':id')
    @UploadImage('category')
    updateCategory(
        @Param('id', ParseIntPipe) categoryId: number,
        @Body() updateCategoryDto: UpdateCategoryDto,
        @UploadedFile() file?: Express.Multer.File
    ) {
        return this.categoryService.update(categoryId, updateCategoryDto, file);
    }

    @Delete(':id')
    deleteCategory(@Param('id', ParseIntPipe) categoryId: number) {
        return this.categoryService.delete(categoryId);
    }
}