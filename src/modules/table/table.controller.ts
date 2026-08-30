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
import { CreateTableDto, QueryTableDto, UpdateTableDto } from './dto/table.dto';
import { TableService } from './table.service';
import { TableSessionDto } from './dto/table-session.dto';

@Controller('table')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Post()
  createTable(
    @Body() createTableDto: CreateTableDto,
    @CurrentUser('userId') createdById?: number,
  ) {
    return this.tableService.create(createTableDto, createdById);
  }

  @Post('table-session')
  handleTableSession(@Body() tableSessionDto: TableSessionDto) {
    return this.tableService.handleTableSession(tableSessionDto);
  }

  @Get()
  getTables(@Query() query: QueryTableDto) {
    return this.tableService.findAll(query);
  }

  @Get(':id')
  getTableById(@Param('id', ParseUUIDPipe) tableId: string) {
    return this.tableService.findOne(tableId);
  }

  @Get('/token/:tableToken')
  getTableByToken(@Param('tableToken') tableToken: string) {
    return this.tableService.findByToken(tableToken);
  }

  @Get('/live-charge/:tableId')
  getLiveCharge(@Param('tableId', ParseUUIDPipe) tableId: string) {
    return this.tableService.getLiveCharge(tableId);
  }

  @Patch(':id')
  updateTable(
    @Param('id', ParseUUIDPipe) tableId: string,
    @Body() updateTableDto: UpdateTableDto,
    @CurrentUser('userId') updatedById?: number,
  ) {
    return this.tableService.update(tableId, updateTableDto, updatedById);
  }

  @Delete(':id')
  deleteTable(
    @Param('id', ParseUUIDPipe) tableId: string,
    @CurrentUser('userId') updatedById?: number,
  ) {
    return this.tableService.delete(tableId, updatedById);
  }
}
