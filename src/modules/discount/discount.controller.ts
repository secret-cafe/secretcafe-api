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
  Req,
} from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { DiscountService } from './discount.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { ToggleDiscountDto } from './dto/toggle-discount.dto';
import { QueryDiscountDto } from './dto/query-discount.dto';
import type { Request } from 'express';

@Controller('discount')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Post()
  create(@Body() dto: CreateDiscountDto, @Req() req: Request) {
    const userId = (req as any).user?.sub;
    return this.discountService.create(dto, userId);
  }

  @Get()
  findAll(@Query() query: QueryDiscountDto) {
    return this.discountService.findAll(query);
  }

  @Get(':discountId')
  findOne(@Param('discountId', ParseUUIDPipe) discountId: string) {
    return this.discountService.findOne(discountId);
  }

  @Patch(':discountId')
  update(
    @Param('discountId', ParseUUIDPipe) discountId: string,
    @Body() dto: UpdateDiscountDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub;
    return this.discountService.update(discountId, dto, userId);
  }

  @Patch(':discountId/activate')
  toggle(
    @Param('discountId', ParseUUIDPipe) discountId: string,
    @Body() dto: ToggleDiscountDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub;
    return this.discountService.toggle(discountId, dto, userId);
  }

  @Delete(':discountId')
  remove(
    @Param('discountId', ParseUUIDPipe) discountId: string,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub;
    return this.discountService.delete(discountId, userId);
  }
}
