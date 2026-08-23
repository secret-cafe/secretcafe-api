import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { MenuService } from '../menu/menu.service';
import { CategoryService } from '../category/category.service';
import { TableService } from '../table/table.service';
import { QueryCategoryDto } from '../category/dto/query-category.dto';
import { TableSessionDto } from '../table/dto/table-session.dto';

@Controller('customer')
export class CustomerController {
    constructor(
        private readonly menuService: MenuService,
        private readonly categoryService: CategoryService,
        private readonly tableService: TableService,
    ) { }

    @Get('categories')
    getCategories(@Query() query: QueryCategoryDto) {
        return this.categoryService.findAll(query);
    }

    @Get('menu')
    getMenu() {
        return this.menuService.findAll();
    }

    @Get('menu/category/:id')
    getMenusByCategory(
        @Param('id', ParseUUIDPipe) categoryId: string,
    ) {
        return this.menuService.findByCategory(categoryId);
    }

    @Get('/table/token/:tableToken')
    getTableByToken(@Param('tableToken') tableToken: string) {
        return this.tableService.findByToken(tableToken);
    }

    @Post('/table/table-session')
    handleTableSession(@Body() tableSessionDto: TableSessionDto) {
        return this.tableService.handleTableSession(tableSessionDto);
    }
}