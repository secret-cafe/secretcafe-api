import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Role } from 'src/common/constants/constants';
import { Auth } from 'src/common/decorators/auth.decorator';
import { DiscountService } from './discount.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { ToggleDiscountDto } from './dto/toggle-discount.dto';
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
  findAll() {
    return this.discountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.discountService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDiscountDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub;
    return this.discountService.update(id, dto, userId);
  }

  @Patch(':id/activate')
  toggle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ToggleDiscountDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub;
    return this.discountService.toggle(id, dto, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.discountService.delete(id);
  }
}
