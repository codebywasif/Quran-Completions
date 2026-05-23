import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Member,
  OutboxMessage,
  OutboxStatus,
  OutboxType,
  Week,
  WeekStatus,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WeekService } from '../week/week.service';
import { AllocationService } from '../allocation/allocation.service';
import { TemplateService } from '../template/template.service';
import { OutboxService } from '../outbox/outbox.service';
import { WaService } from '../wa/wa.service';

const FRIDAY = 5;

/**
 * Orchestrates the weekly cycle. Each method is safe to call from both the
 * scheduler (cron) and a manual dashboard action, and is idempotent where it
 * matters (won't double-create weeks or re-send messages).
 */
@Injectable()
export class CycleService {
  private readonly logger = new Logger(CycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly weeks: WeekService,
    private readonly allocation: AllocationService,
    private readonly templates: TemplateService,
    private readonly outbox: OutboxService,
    private readonly wa: WaService,
  ) {}

  /** Thursday night: open the upcoming week and post the capacity poll. */
  async openNextWeek(autoSend = true): Promise<{ week: Week; poll: OutboxMessage }> {
    const { timezone } = await this.settings.get();
    const startDate = this.upcomingFriday(timezone);

    let week = await this.prisma.week.findFirst({
      where: { startDate: DateTime.fromISO(startDate, { zone: timezone }).startOf('day').toUTC().toJSDate() },
    });
    if (!week) {
      week = await this.weeks.createWeek({ startDate });
      this.logger.log(`Opened week #${week.weekNumber} (starts ${startDate})`);
    }

    const existing = await this.latestOutbox(week.id, 'CAPACITY_POLL');
    if (existing && existing.status === OutboxStatus.SENT) {
      return { week, poll: existing };
    }

    const content = await this.templates.render('CAPACITY_POLL', week.id);
    const poll =
      existing ??
      (await this.outbox.create(week.id, 'CAPACITY_POLL', content, {
        status: OutboxStatus.SCHEDULED,
      }));

    if (autoSend) {
      try {
        return { week, poll: await this.outbox.send(poll.id) };
      } catch (e) {
        this.logger.error(`Capacity poll auto-send failed: ${String(e)}`);
      }
    }
    return { week, poll };
  }

  /** Friday: auto-allocate and draft the allocation list for approval. */
  async prepareAllocation(weekId: string): Promise<{
    generate: Awaited<ReturnType<AllocationService['generate']>>;
    outbox: OutboxMessage;
  }> {
    const generate = await this.allocation.generate(weekId);

    const week = await this.weeks.getById(weekId);
    if (week.status === WeekStatus.COLLECTING) {
      await this.weeks.transition(weekId, WeekStatus.ALLOCATING);
    }

    const content = await this.templates.render('ALLOCATION', weekId);
    const existing = await this.latestOutbox(weekId, 'ALLOCATION');
    const out =
      existing && existing.status !== OutboxStatus.SENT
        ? await this.outbox.updateContent(existing.id, content)
        : await this.outbox.create(weekId, 'ALLOCATION', content, {
            status: OutboxStatus.PENDING_APPROVAL,
            requiresApproval: true,
          });
    return { generate, outbox: out };
  }

  /** Moderator "Approve & Send": post allocation list + completion poll. */
  async approveAllocation(weekId: string): Promise<{
    allocation: OutboxMessage;
    completionPoll: OutboxMessage;
  }> {
    const allocationDraft = await this.latestOutbox(weekId, 'ALLOCATION');
    if (!allocationDraft) {
      throw new NotFoundException('No allocation draft to approve — prepare it first');
    }
    const sentAllocation =
      allocationDraft.status === OutboxStatus.SENT
        ? allocationDraft
        : await this.outbox.approve(allocationDraft.id);

    const pollContent = await this.templates.render('COMPLETION_POLL', weekId);
    const completionPoll = await this.outbox.create(
      weekId,
      'COMPLETION_POLL',
      pollContent,
      { status: OutboxStatus.SCHEDULED },
    );
    const sentPoll = await this.outbox.send(completionPoll.id);

    const week = await this.weeks.getById(weekId);
    if (week.status === WeekStatus.ALLOCATING) {
      await this.weeks.transition(weekId, WeekStatus.IN_PROGRESS);
    }
    return { allocation: sentAllocation, completionPoll: sentPoll };
  }

  /** Mon/Wed/Thu: post a completion reminder (auto-send). */
  async sendReminder(
    weekId: string,
    type: 'REMINDER_MON' | 'REMINDER_WED' | 'REMINDER_THU',
  ): Promise<OutboxMessage> {
    const content = await this.templates.render(type, weekId);
    const msg = await this.outbox.create(weekId, type, content, {
      status: OutboxStatus.SCHEDULED,
    });
    return this.outbox.send(msg.id);
  }

  /** Draft the weekly summary for approval and record the Quran count. */
  async prepareSummary(weekId: string): Promise<OutboxMessage> {
    const stats = await this.templates.buildStats(weekId);
    await this.prisma.week.update({
      where: { id: weekId },
      data: { quranCount: stats.quranCount },
    });
    const content = await this.templates.render('SUMMARY', weekId);
    const existing = await this.latestOutbox(weekId, 'SUMMARY');
    if (existing && existing.status !== OutboxStatus.SENT) {
      return this.outbox.updateContent(existing.id, content);
    }
    return this.outbox.create(weekId, 'SUMMARY', content, {
      status: OutboxStatus.PENDING_APPROVAL,
      requiresApproval: true,
    });
  }

  /** Moderator approves the summary: post it and close the week. */
  async approveSummary(weekId: string): Promise<OutboxMessage> {
    const draft = await this.latestOutbox(weekId, 'SUMMARY');
    if (!draft) {
      throw new NotFoundException('No summary draft to approve — prepare it first');
    }
    const sent =
      draft.status === OutboxStatus.SENT ? draft : await this.outbox.approve(draft.id);
    const week = await this.weeks.getById(weekId);
    if (week.status === WeekStatus.IN_PROGRESS) {
      await this.weeks.transition(weekId, WeekStatus.COMPLETED);
    }
    return sent;
  }

  /** Active members who have allocations this week but haven't completed. */
  async listNonCompleters(weekId: string): Promise<Member[]> {
    const allocations = await this.prisma.allocation.findMany({
      where: { weekId },
      select: { memberId: true },
    });
    const ids = [...new Set(allocations.map((a) => a.memberId))];
    if (ids.length === 0) return [];
    const completions = await this.prisma.completionVote.findMany({
      where: { weekId },
      select: { memberId: true },
    });
    const done = new Set(completions.map((c) => c.memberId));
    const pending = ids.filter((id) => !done.has(id));
    return this.prisma.member.findMany({
      where: { id: { in: pending }, active: true },
    });
  }

  /**
   * Start DMing each non-completer a reminder. Returns immediately with the
   * counts; the actual (throttled) sending runs in the background so the HTTP
   * call doesn't block. NOTE: this DMs individuals — the moderator opted into
   * the ban risk; sends are heavily rate-limited.
   */
  async startNonCompleterDM(
    weekId: string,
  ): Promise<{ pending: number; withPhone: number }> {
    const members = await this.listNonCompleters(weekId);
    const withPhone = members.filter((m) => m.whatsappId).length;
    void this.runNonCompleterDM(weekId).catch((e) =>
      this.logger.error(`runNonCompleterDM failed: ${String(e)}`),
    );
    return { pending: members.length, withPhone };
  }

  /** Send the DM reminders sequentially with randomized delays (ban-risk control). */
  async runNonCompleterDM(
    weekId: string,
  ): Promise<{ sent: number; skipped: number; failed: number }> {
    const members = await this.listNonCompleters(weekId);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const m of members) {
      if (!m.whatsappId) {
        skipped += 1;
        this.logger.warn(`No phone number for ${m.displayName} — DM skipped`);
        continue;
      }
      try {
        const text = await this.templates.renderDmReminder(weekId, m.displayName);
        await this.wa.sendText(m.whatsappId, text);
        sent += 1;
        // 2–6s jitter between DMs to look human and reduce ban risk.
        await this.sleep(2000 + Math.floor(Math.random() * 4000));
      } catch (e) {
        failed += 1;
        this.logger.error(`DM to ${m.displayName} failed: ${String(e)}`);
      }
    }
    this.logger.log(
      `Non-completer DM run for week ${weekId}: sent=${sent} skipped=${skipped} failed=${failed}`,
    );
    return { sent, skipped, failed };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private latestOutbox(
    weekId: string,
    type: OutboxType,
  ): Promise<OutboxMessage | null> {
    return this.prisma.outboxMessage.findFirst({
      where: { weekId, type, status: { not: OutboxStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private upcomingFriday(tz: string): string {
    const now = DateTime.now().setZone(tz);
    const delta = (FRIDAY - now.weekday + 7) % 7; // 0 if today is Friday
    return now.plus({ days: delta }).toISODate() as string;
  }
}
