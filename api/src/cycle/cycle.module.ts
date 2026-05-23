import { Module } from '@nestjs/common';
import { WeekModule } from '../week/week.module';
import { AllocationModule } from '../allocation/allocation.module';
import { TemplateModule } from '../template/template.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CycleService } from './cycle.service';
import { SchedulerService } from './scheduler.service';
import { CycleController } from './cycle.controller';

@Module({
  imports: [WeekModule, AllocationModule, TemplateModule, OutboxModule],
  providers: [CycleService, SchedulerService],
  controllers: [CycleController],
  exports: [CycleService],
})
export class CycleModule {}
