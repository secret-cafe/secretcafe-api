import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { CreateTableDto, GetTableByTypeDto, UpdateTableDto } from './dto/table.dto';
import { TableService } from './table.service';
import { TableSessionDto } from './dto/table-session.dto';

@Controller('table')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class TableController {
    constructor(private readonly tableService: TableService) { }

    @Post()
    createTable(@Body() createTableDto: CreateTableDto) {
        return this.tableService.create(createTableDto);
    }

    @Post('table-session')
    handleTableSession(@Body() tableSessionDto: TableSessionDto) {
        return this.tableService.handleTableSession(tableSessionDto);
    }

    @Get()
    getTables(@Query() query: GetTableByTypeDto) {
        if (query.type) {
            return this.tableService.findByType(query.type);
        }

        return this.tableService.findAll();
    }

    @Get(':id')
    getTableById(@Param('id', ParseIntPipe) TableId: number) {
        return this.tableService.findOne(TableId);
    }

    @Get('/token/:tableToken')
    getTableByToken(@Param('tableToken') tableToken: string) {
        return this.tableService.findByToken(tableToken);
    }

    @Get('/live-charge/:tableId')
    getLiveCharge(@Param('tableId') tableId: number) {
        return this.tableService.getLiveCharge(Number(tableId));
    }

    @Patch(':id')
    updateTable(
        @Param('id', ParseIntPipe) TableId: number,
        @Body() updateTableDto: UpdateTableDto,
    ) {
        return this.tableService.update(TableId, updateTableDto);
    }

    @Delete(':id')
    deleteTable(@Param('id', ParseIntPipe) TableId: number) {
        return this.tableService.delete(TableId);
    }
}