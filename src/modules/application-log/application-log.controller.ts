import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { ApplicationLogService } from './application-log.service';
import { QueryApplicationLogDto } from './dto/query-application-log.dto';

@Controller('applicationlogs')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class ApplicationLogController {
  constructor(private readonly applicationLogService: ApplicationLogService) { }

  @Get()
  getAll(@Query() query: QueryApplicationLogDto) {
    return this.applicationLogService.findAll(query);
  }

  @Get('clean-logs')
  public cleanlogs() {
    return this.applicationLogService.cleanlogs();
  }

  @Get(':logId')
  getById(@Param('logId', ParseUUIDPipe) logId: string) {
    return this.applicationLogService.findOne(logId);
  }
}
