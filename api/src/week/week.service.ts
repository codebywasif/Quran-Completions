import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Week, WeekStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** Allowed week status transitions. */
const TRANSITIONS: Record<WeekStatus, WeekStatus[]> = {
  COLLECTING: ['ALLOCATING'],
  ALLOCATING: ['IN_PROGRESS', 'COLLECTING'],
  IN_PROGRESS: ['COMPLETED', 'ALLOCATING'],
  COMPLETED: [],
};

const FRIDAY = 5; // luxon weekday: Mon=1 … Sun=7
const DEADLINE_HOUR = 19; // UK 7pm canonical deadline (refined per-region in messages)

@Injectable()
export class WeekService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  list(): Promise<Week[]> {
    return this.prisma.week.findMany({ orderBy: { weekNumber: 'desc' } });
  }

  getCurrent(): Promise<Week | null> {
    return this.prisma.week.findFirst({ orderBy: { weekNumber: 'desc' } });
  }

  async getById(id: string): Promise<Week> {
    const week = await this.prisma.week.findUnique({ where: { id } });
    if (!week) throw new NotFoundException(`Week ${id} not found`);
    return week;
  }

  /**
   * Create a new week. By default it starts on the most recent Friday in the
   * configured timezone and is due the following Thursday at the deadline hour.
   */
  async createWeek(opts?: { startDate?: string }): Promise<Week> {
    const { timezone } = await this.settings.get();
    const start = this.resolveStartFriday(opts?.startDate, timezone);
    const deadline = start
      .plus({ days: 6 })
      .set({ hour: DEADLINE_HOUR, minute: 0, second: 0, millisecond: 0 });

    const startJs = start.toUTC().toJSDate();
    const clash = await this.prisma.week.findFirst({
      where: { startDate: startJs },
    });
    if (clash) {
      throw new ConflictException(
        `A week starting ${start.toISODate()} already exists (week ${clash.weekNumber}).`,
      );
    }

    const last = await this.prisma.week.findFirst({
      orderBy: { weekNumber: 'desc' },
    });
    const weekNumber = (last?.weekNumber ?? 0) + 1;

    return this.prisma.week.create({
      data: {
        weekNumber,
        startDate: startJs,
        deadline: deadline.toUTC().toJSDate(),
        status: WeekStatus.COLLECTING,
      },
    });
  }

  /** Delete a week and all its data (votes, requests, allocations, polls,
   * outbox) via cascade. Intended for testing / restarting a week. */
  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.week.delete({ where: { id } });
  }

  async transition(id: string, to: WeekStatus): Promise<Week> {
    const week = await this.getById(id);
    const allowed = TRANSITIONS[week.status];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Cannot move week from ${week.status} to ${to}. Allowed: ${
          allowed.join(', ') || '(none)'
        }`,
      );
    }
    return this.prisma.week.update({ where: { id }, data: { status: to } });
  }

  /** Resolve the Friday a week begins on, in the given timezone. */
  private resolveStartFriday(startDate: string | undefined, tz: string): DateTime {
    if (startDate) {
      const dt = DateTime.fromISO(startDate, { zone: tz });
      if (!dt.isValid) {
        throw new BadRequestException(`Invalid startDate: ${startDate}`);
      }
      return dt.startOf('day');
    }
    const now = DateTime.now().setZone(tz);
    const daysSinceFriday = (now.weekday - FRIDAY + 7) % 7;
    return now.minus({ days: daysSinceFriday }).startOf('day');
  }
}
