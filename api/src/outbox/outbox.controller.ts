import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';
import { OutboxService } from './outbox.service';

class UpdateContentDto {
  @IsString()
  @MinLength(1)
  content!: string;
}

@Controller('outbox')
export class OutboxController {
  constructor(private readonly outbox: OutboxService) {}

  @Get()
  list(
    @Query('weekId') weekId?: string,
    @Query('status') status?: OutboxStatus,
  ) {
    return this.outbox.list({ weekId, status });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.outbox.get(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.outbox.updateContent(id, dto.content);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.outbox.approve(id);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.outbox.send(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.outbox.cancel(id);
  }
}
