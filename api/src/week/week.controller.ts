import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { WeekStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { WeekService } from './week.service';

class CreateWeekDto {
  @IsOptional()
  @IsString()
  startDate?: string;
}

class TransitionDto {
  @IsIn(Object.values(WeekStatus))
  status!: WeekStatus;
}

@Controller('weeks')
export class WeekController {
  constructor(private readonly weeks: WeekService) {}

  @Get()
  list() {
    return this.weeks.list();
  }

  @Get('current')
  async current() {
    const week = await this.weeks.getCurrent();
    if (!week) throw new NotFoundException('No weeks exist yet');
    return week;
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.weeks.getById(id);
  }

  @Post()
  create(@Body() dto: CreateWeekDto) {
    return this.weeks.createWeek(dto);
  }

  @Post(':id/transition')
  transition(@Param('id') id: string, @Body() dto: TransitionDto) {
    return this.weeks.transition(id, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.weeks.delete(id);
  }
}
