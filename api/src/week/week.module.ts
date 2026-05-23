import { Module } from '@nestjs/common';
import { WeekService } from './week.service';
import { WeekController } from './week.controller';

@Module({
  providers: [WeekService],
  controllers: [WeekController],
  exports: [WeekService],
})
export class WeekModule {}
