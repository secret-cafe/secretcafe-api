import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile } from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UploadImage } from 'src/common/decorators/upload-image.decorator';

@Controller('category')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Post()
    @UploadImage('category')
    createCategory(
        @Body() createCategoryDto: CreateCategoryDto,
        @CurrentUser('userId') userId?: number,
        @UploadedFile() file?: Express.Multer.File
    ) {
        return this.categoryService.create(createCategoryDto, userId, file);
    }

    @Get()
    getAllCategories(@Query() query: QueryCategoryDto) {
        return this.categoryService.findAll(query);
    }

    @Get(':id')
    getCategoryById(@Param('id', ParseUUIDPipe) categoryId: string) {
        return this.categoryService.findOne(categoryId);
    }

    @Patch(':id')
    @UploadImage('category')
    updateCategory(
        @Param('id', ParseUUIDPipe) categoryId: string,
        @Body() updateCategoryDto: UpdateCategoryDto,
        @CurrentUser('userId') updatedById?: number,
        @UploadedFile() file?: Express.Multer.File
    ) {
        return this.categoryService.update(categoryId, updateCategoryDto, file, updatedById);
    }

    @Delete(':id')
    deleteCategory(
        @Param('id', ParseUUIDPipe) categoryId: string,
        @CurrentUser('userId') updatedById?: number,
    ) {
        return this.categoryService.delete(categoryId, updatedById);
    }
}