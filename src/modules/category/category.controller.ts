import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Role } from '../common/constants/constants';
import { Auth } from '../common/decorators/auth.decorator';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('category')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Post()
    createCategory(@Body() createCategoryDto: CreateCategoryDto) {
        return this.categoryService.create(createCategoryDto);
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
    updateCategory(
        @Param('id', ParseIntPipe) categoryId: number,
        @Body() updateCategoryDto: UpdateCategoryDto,
    ) {
        return this.categoryService.update(categoryId, updateCategoryDto);
    }

    @Delete(':id')
    deleteCategory(@Param('id', ParseIntPipe) categoryId: number) {
        return this.categoryService.delete(categoryId);
    }
}