import { Body, Controller, Param, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { CycleService } from './cycle.service';

class ReminderDto {
  @IsIn(['REMINDER_MON', 'REMINDER_WED', 'REMINDER_THU'])
  type!: 'REMINDER_MON' | 'REMINDER_WED' | 'REMINDER_THU';
}

@Controller()
export class CycleController {
  constructor(private readonly cycle: CycleService) {}

  /** Open the upcoming week and post the capacity poll now. */
  @Post('cycle/open-next-week')
  openNextWeek() {
    return this.cycle.openNextWeek(true);
  }

  /** Auto-allocate and draft the allocation list for approval. */
  @Post('weeks/:weekId/prepare-allocation')
  prepareAllocation(@Param('weekId') weekId: string) {
    return this.cycle.prepareAllocation(weekId);
  }

  /** Approve & send the allocation list + completion poll. */
  @Post('weeks/:weekId/approve-allocation')
  approveAllocation(@Param('weekId') weekId: string) {
    return this.cycle.approveAllocation(weekId);
  }

  @Post('weeks/:weekId/send-reminder')
  sendReminder(@Param('weekId') weekId: string, @Body() dto: ReminderDto) {
    return this.cycle.sendReminder(weekId, dto.type);
  }

  /** DM each member who hasn't completed yet (runs in the background). */
  @Post('weeks/:weekId/dm-non-completers')
  dmNonCompleters(@Param('weekId') weekId: string) {
    return this.cycle.startNonCompleterDM(weekId);
  }

  @Post('weeks/:weekId/prepare-summary')
  prepareSummary(@Param('weekId') weekId: string) {
    return this.cycle.prepareSummary(weekId);
  }

  @Post('weeks/:weekId/approve-summary')
  approveSummary(@Param('weekId') weekId: string) {
    return this.cycle.approveSummary(weekId);
  }
}
