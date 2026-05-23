import { Injectable } from '@nestjs/common';
import { OutboxType } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** Default country/time deadline table (from the group's actual messages). */
export const DEFAULT_TIMES_TABLE = [
  'UK – 7:00 PM',
  'Saudi Arabia – 9:00 PM',
  'Pakistan – 11:00 PM',
  'India – 11:30 PM',
  'East Coast USA (ET) – 2:00 PM',
  'West Coast USA (PT) – 11:00 AM',
  'South Africa – 8:00 PM',
  'Germany – 8:00 PM',
  'Bashkortostan, Russia – 11:00 PM',
].join('\n');

/** Default message templates, keyed by OutboxType. Placeholders: {…}. */
export const DEFAULT_TEMPLATES: Record<OutboxType, string> = {
  CAPACITY_POLL:
    'How many Juz can you read next week. To be completed by {deadlineShort}',
  ALLOCATION: [
    'Salaam Alykum brothers. Please see the Quran allocations below. This is to be completed by Thursday at the following times in your respective countries/regions:',
    '',
    '{timesTable}',
    '',
    'JazakAllah',
    '',
    '{quranLists}',
  ].join('\n'),
  COMPLETION_POLL: 'Please vote Yes once your Juz has been completed',
  REMINDER_MON: [
    'Salaam Alykum brothers. Please make sure your juz are completed today by the following times in your respective countries/regions',
    '',
    '{timesTable}',
  ].join('\n'),
  REMINDER_WED: [
    'Salaam Alykum brothers. Please make sure your juz are completed today by the following times in your respective countries/regions',
    '',
    '{timesTable}',
  ].join('\n'),
  REMINDER_THU: [
    'Salaam Alykum brothers. Please make sure your juz are completed today by the following times in your respective countries/regions',
    '',
    '{timesTable}',
  ].join('\n'),
  SUMMARY: [
    'Salaam Alykum,',
    '',
    'Alhamdulillah, we have completed {quranCount} Qurans this week. {peopleCount} people were involved in this weeks completions from {countriesCount} different countries Mashallah.',
    '',
    'May Allah send the blessings of our efforts to all of our loved ones that have passed away and to our friends and family that are sick or going through any hardship. May Allah accept our efforts and grant us the ability to bring the Qur’an into our daily lives.',
    '',
    'Jazakallah for your participation. May Allah reward you all.',
  ].join('\n'),
};

/** Default private-DM reminder for members who haven't completed yet. */
export const DEFAULT_DM_REMINDER = [
  'Salaam Alykum {name},',
  '',
  'A friendly reminder that your Juz for this week hasn’t been marked complete yet. Please finish it and vote “Yes” on the completion poll once done.',
  '',
  'Today’s deadline times:',
  '{timesTable}',
  '',
  'JazakAllah',
].join('\n');

@Injectable()
export class TemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Render the "Quran N / 1 Name / 2 Name…" allocation list for a week. */
  async renderAllocationList(weekId: string): Promise<string> {
    const allocations = await this.prisma.allocation.findMany({
      where: { weekId },
      include: { member: { select: { displayName: true } } },
      orderBy: [{ quranNumber: 'asc' }, { juzNumber: 'asc' }],
    });
    if (allocations.length === 0) return '(no allocations yet)';

    const blocks: string[] = [];
    let currentQuran = -1;
    let lines: string[] = [];
    for (const a of allocations) {
      if (a.quranNumber !== currentQuran) {
        if (lines.length > 0) blocks.push(lines.join('\n'));
        currentQuran = a.quranNumber;
        lines = [`Quran ${a.quranNumber}`, ''];
      }
      lines.push(`${a.juzNumber} ${a.member.displayName}`);
    }
    if (lines.length > 0) blocks.push(lines.join('\n'));
    return blocks.join('\n\n');
  }

  /** Compute summary stats for a week from its allocations. */
  async buildStats(weekId: string): Promise<{
    quranCount: number;
    peopleCount: number;
    countriesCount: number;
  }> {
    const allocations = await this.prisma.allocation.findMany({
      where: { weekId },
      include: { member: { select: { country: true } } },
    });
    const qurans = new Set(allocations.map((a) => a.quranNumber));
    const people = new Set(allocations.map((a) => a.memberId));
    const countries = new Set(
      allocations
        .map((a) => a.member.country)
        .filter((c): c is string => Boolean(c)),
    );
    const { countriesOverride } = await this.settings.get();
    return {
      quranCount: qurans.size,
      peopleCount: people.size,
      countriesCount: countriesOverride ?? countries.size,
    };
  }

  getTemplate(type: OutboxType, templates: Record<string, string>): string {
    const custom = templates?.[type];
    return custom && custom.trim().length > 0 ? custom : DEFAULT_TEMPLATES[type];
  }

  /** Render a message of the given type for a week, filling placeholders. */
  async render(type: OutboxType, weekId: string): Promise<string> {
    const settings = await this.settings.get();
    const week = await this.prisma.week.findUnique({ where: { id: weekId } });
    const tz = settings.timezone || 'Europe/London';
    const timesTable =
      settings.timesTable && settings.timesTable.trim().length > 0
        ? settings.timesTable
        : DEFAULT_TIMES_TABLE;

    const context: Record<string, string> = {
      timesTable,
      weekNumber: week ? String(week.weekNumber) : '',
      date: DateTime.now().setZone(tz).toFormat('dd/MM/yyyy'),
      deadlineShort: week
        ? DateTime.fromJSDate(week.deadline).setZone(tz).toFormat('dd/MM')
        : '',
      deadlineDate: week
        ? DateTime.fromJSDate(week.deadline).setZone(tz).toFormat('cccc dd LLLL')
        : '',
    };

    if (type === 'ALLOCATION') {
      context.quranLists = await this.renderAllocationList(weekId);
    }
    if (type === 'SUMMARY') {
      const stats = await this.buildStats(weekId);
      context.quranCount = String(stats.quranCount);
      context.peopleCount = String(stats.peopleCount);
      context.countriesCount = String(stats.countriesCount);
    }

    const template = this.getTemplate(
      type,
      (settings.templates ?? {}) as Record<string, string>,
    );
    return this.fill(template, context);
  }

  /** Render the personal DM reminder for a non-completer. */
  async renderDmReminder(weekId: string, memberName: string): Promise<string> {
    const settings = await this.settings.get();
    const week = await this.prisma.week.findUnique({ where: { id: weekId } });
    const tz = settings.timezone || 'Europe/London';
    const timesTable =
      settings.timesTable && settings.timesTable.trim().length > 0
        ? settings.timesTable
        : DEFAULT_TIMES_TABLE;
    const templates = (settings.templates ?? {}) as Record<string, string>;
    const custom = templates['REMINDER_DM'];
    const template =
      custom && custom.trim().length > 0 ? custom : DEFAULT_DM_REMINDER;
    return this.fill(template, {
      name: memberName,
      timesTable,
      deadlineShort: week
        ? DateTime.fromJSDate(week.deadline).setZone(tz).toFormat('dd/MM')
        : '',
    });
  }

  private fill(template: string, context: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in context ? context[key] : match,
    );
  }
}
