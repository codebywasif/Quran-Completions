import { Injectable } from '@nestjs/common';
import {
  CapacityVote,
  JuzRequest,
  Prisma,
  VoteSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

export const CAPACITY_OPTIONS = ['1', '2', '3', '4', '5', '5+'] as const;

@Injectable()
export class CapacityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Parse a poll option label ("3", "5+") into a numeric Juz count. */
  parseLabel(label: string, fivePlusValue: number): number {
    const trimmed = label.trim();
    if (trimmed.endsWith('+')) return fivePlusValue;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  async upsertVote(
    weekId: string,
    memberId: string,
    label: string,
    source: VoteSource = VoteSource.MANUAL,
  ): Promise<CapacityVote> {
    const { fivePlusValue } = await this.settings.get();
    const juzCount = this.parseLabel(label, fivePlusValue);
    return this.prisma.capacityVote.upsert({
      where: { weekId_memberId: { weekId, memberId } },
      update: { juzCount, rawLabel: label, source },
      create: { weekId, memberId, juzCount, rawLabel: label, source },
    });
  }

  listVotes(weekId: string): Promise<(CapacityVote & { member: { displayName: string } })[]> {
    return this.prisma.capacityVote.findMany({
      where: { weekId },
      include: { member: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeVote(weekId: string, memberId: string): Promise<void> {
    await this.prisma.capacityVote.deleteMany({ where: { weekId, memberId } });
  }

  /** Poll-style tally: count of voters per option label, plus totals. */
  async tally(weekId: string): Promise<{
    options: { label: string; count: number }[];
    voters: number;
    totalJuz: number;
  }> {
    const votes = await this.prisma.capacityVote.findMany({ where: { weekId } });
    const counts = new Map<string, number>(
      CAPACITY_OPTIONS.map((o) => [o, 0]),
    );
    let totalJuz = 0;
    for (const v of votes) {
      const label = v.rawLabel ?? String(v.juzCount);
      counts.set(label, (counts.get(label) ?? 0) + 1);
      totalJuz += v.juzCount;
    }
    return {
      options: [...counts.entries()].map(([label, count]) => ({ label, count })),
      voters: votes.length,
      totalJuz,
    };
  }

  // --- Juz requests -------------------------------------------------------

  async upsertRequest(
    weekId: string,
    memberId: string,
    requestedJuz: number[],
    note?: string,
  ): Promise<JuzRequest> {
    const clean = [...new Set(requestedJuz.filter((j) => j >= 1 && j <= 30))];
    return this.prisma.juzRequest.upsert({
      where: { weekId_memberId: { weekId, memberId } },
      update: { requestedJuz: clean, note: note ?? null },
      create: { weekId, memberId, requestedJuz: clean, note: note ?? null },
    });
  }

  listRequests(weekId: string): Promise<(JuzRequest & { member: { displayName: string } })[]> {
    return this.prisma.juzRequest.findMany({
      where: { weekId },
      include: { member: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeRequest(weekId: string, memberId: string): Promise<void> {
    await this.prisma.juzRequest.deleteMany({ where: { weekId, memberId } });
  }

  /** Build the allocation input (expanded counts + requests) for a week. */
  async buildAllocationInput(weekId: string): Promise<
    { memberId: string; juzCount: number; requestedJuz: number[] }[]
  > {
    const [votes, requests] = await Promise.all([
      this.prisma.capacityVote.findMany({
        where: { weekId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.juzRequest.findMany({ where: { weekId } }),
    ]);
    const reqByMember = new Map<string, number[]>(
      requests.map((r: JuzRequest) => [r.memberId, r.requestedJuz]),
    );
    return votes.map((v: CapacityVote) => ({
      memberId: v.memberId,
      juzCount: v.juzCount,
      requestedJuz: reqByMember.get(v.memberId) ?? [],
    }));
  }
}
