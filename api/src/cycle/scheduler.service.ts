import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Week, WeekStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CycleService } from './cycle.service';

// Timezone is read at module-load from the environment (cron decorators need a
// literal). The per-job schedule can be made fully dynamic later.
const TZ = process.env.APP_TIMEZONE || 'Europe/London';

/**
 * Cron jobs driving the weekly cycle. Each handler is a thin wrapper over
 * CycleService. Disable entirely with SCHEDULER_DISABLED=true.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cycle: CycleService,
  ) {}

  private get disabled(): boolean {
    return process.env.SCHEDULER_DISABLED === 'true';
  }

  /** Thursday 20:00 — open next week + post capacity poll. */
  @Cron('0 20 * * 4', { name: 'capacityPoll', timeZone: TZ })
  async thursdayCapacityPoll(): Promise<void> {
    if (this.disabled) return;
    this.logger.log('Cron: opening next week + capacity poll');
    await this.cycle.openNextWeek(true).catch((e) =>
      this.logger.error(`openNextWeek failed: ${String(e)}`),
    );
  }

  /** Friday 18:00 — auto-allocate and draft the allocation list. */
  @Cron('0 18 * * 5', { name: 'prepareAllocation', timeZone: TZ })
  async fridayPrepareAllocation(): Promise<void> {
    if (this.disabled) return;
    const week = await this.weekByStatus(WeekStatus.COLLECTING);
    if (!week) return;
    this.logger.log(`Cron: preparing allocation for week #${week.weekNumber}`);
    await this.cycle.prepareAllocation(week.id).catch((e) =>
      this.logger.error(`prepareAllocation failed: ${String(e)}`),
    );
  }

  @Cron('0 9 * * 1', { name: 'reminderMon', timeZone: TZ })
  mondayReminder(): Promise<void> {
    return this.reminder('REMINDER_MON');
  }

  @Cron('0 9 * * 3', { name: 'reminderWed', timeZone: TZ })
  wednesdayReminder(): Promise<void> {
    return this.reminder('REMINDER_WED');
  }

  @Cron('0 9 * * 4', { name: 'reminderThu', timeZone: TZ })
  thursdayReminder(): Promise<void> {
    return this.reminder('REMINDER_THU');
  }

  /** Thursday 14:00 — DM members who still haven't voted "Yes". */
  @Cron('0 14 * * 4', { name: 'dmNonCompleters', timeZone: TZ })
  async thursdayDmNonCompleters(): Promise<void> {
    if (this.disabled) return;
    const week = await this.weekByStatus(WeekStatus.IN_PROGRESS);
    if (!week) return;
    this.logger.log(`Cron: DM non-completers for week #${week.weekNumber}`);
    await this.cycle.runNonCompleterDM(week.id).catch((e) =>
      this.logger.error(`dmNonCompleters failed: ${String(e)}`),
    );
  }

  /** Thursday 19:30 — after the deadline, draft the weekly summary. */
  @Cron('30 19 * * 4', { name: 'prepareSummary', timeZone: TZ })
  async thursdaySummary(): Promise<void> {
    if (this.disabled) return;
    const week = await this.weekByStatus(WeekStatus.IN_PROGRESS);
    if (!week) return;
    this.logger.log(`Cron: preparing summary for week #${week.weekNumber}`);
    await this.cycle.prepareSummary(week.id).catch((e) =>
      this.logger.error(`prepareSummary failed: ${String(e)}`),
    );
  }

  private async reminder(
    type: 'REMINDER_MON' | 'REMINDER_WED' | 'REMINDER_THU',
  ): Promise<void> {
    if (this.disabled) return;
    const week = await this.weekByStatus(WeekStatus.IN_PROGRESS);
    if (!week) return;
    this.logger.log(`Cron: ${type} for week #${week.weekNumber}`);
    await this.cycle.sendReminder(week.id, type).catch((e) =>
      this.logger.error(`${type} failed: ${String(e)}`),
    );
  }

  private weekByStatus(status: WeekStatus): Promise<Week | null> {
    return this.prisma.week.findFirst({
      where: { status },
      orderBy: { weekNumber: 'desc' },
    });
  }
}
