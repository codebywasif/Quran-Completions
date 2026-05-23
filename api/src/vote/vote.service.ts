import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CompletionSource,
  PollKind,
  Prisma,
  WaPoll,
  WeekStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MembersService } from '../members/members.service';
import { CapacityService } from '../capacity/capacity.service';
import { AllocationService } from '../allocation/allocation.service';
import {
  WaIncomingMessage,
  WaService,
  WaVoteUpdate,
} from '../wa/wa.service';

@Injectable()
export class VoteService implements OnModuleInit {
  private readonly logger = new Logger(VoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WaService,
    private readonly settings: SettingsService,
    private readonly members: MembersService,
    private readonly capacity: CapacityService,
    private readonly allocation: AllocationService,
  ) {}

  onModuleInit(): void {
    // Auto-read poll votes and the "done"-reply fallback.
    this.wa.votes$.subscribe((v) => {
      void this.ingestVote(v).catch((e) =>
        this.logger.error(`ingestVote failed: ${String(e)}`),
      );
    });
    this.wa.messages$.subscribe((m) => {
      void this.ingestMessage(m).catch((e) =>
        this.logger.error(`ingestMessage failed: ${String(e)}`),
      );
    });
  }

  // --- poll registration --------------------------------------------------

  /** Record a poll we posted so its incoming votes can be interpreted. */
  registerPoll(
    weekId: string,
    kind: PollKind,
    waMessageId: string,
    optionMap: Record<string, number>,
  ): Promise<WaPoll> {
    return this.prisma.waPoll.upsert({
      where: { waMessageId },
      update: { optionMap: optionMap as Prisma.InputJsonValue, kind, weekId },
      create: {
        weekId,
        kind,
        waMessageId,
        optionMap: optionMap as Prisma.InputJsonValue,
      },
    });
  }

  // --- ingestion ----------------------------------------------------------

  /** Apply an incoming poll vote (auto-read path). */
  async ingestVote(update: WaVoteUpdate): Promise<void> {
    if (!update.pollMessageId) return;
    const poll = await this.prisma.waPoll.findUnique({
      where: { waMessageId: update.pollMessageId },
    });
    if (!poll) {
      this.logger.debug(
        `Vote for untracked poll ${update.pollMessageId} — ignored`,
      );
      return;
    }

    const phoneWid = await this.wa.resolvePhone(update.voterWid);
    const member = await this.members.findOrCreateProvisional(
      update.voterWid,
      phoneWid,
    );

    // Audit log is best-effort — never let it block applying the actual vote.
    try {
      await this.prisma.voteEvent.create({
        data: {
          pollId: poll.id,
          voterWid: update.voterWid,
          selectedOptions: update.selectedOptions as Prisma.InputJsonValue,
          interactedAt: update.interactedAt,
          processed: true,
          note: member.provisional
            ? 'provisional member (needs confirmation)'
            : null,
        },
      });
    } catch (e) {
      this.logger.warn(`Could not record VoteEvent audit row: ${String(e)}`);
    }

    if (poll.kind === PollKind.CAPACITY) {
      if (update.selectedOptions.length === 0) {
        await this.capacity.removeVote(poll.weekId, member.id);
      } else {
        await this.capacity.upsertVote(
          poll.weekId,
          member.id,
          update.selectedOptions[0],
          'POLL',
        );
      }
    } else {
      const optionMap = (poll.optionMap ?? {}) as Record<string, number>;
      const isYes = update.selectedOptions.some(
        (label) => (optionMap[label] ?? 0) > 0,
      );
      if (isYes) {
        await this.recordCompletion(poll.weekId, member.id, CompletionSource.POLL);
      } else {
        await this.clearCompletion(poll.weekId, member.id);
      }
    }
  }

  /** "done"-reply fallback: a group text matching a completion keyword. */
  async ingestMessage(msg: WaIncomingMessage): Promise<void> {
    if (msg.fromMe) return;
    const settings = await this.settings.get();
    if (!settings.groupChatId || msg.chatId !== settings.groupChatId) return;

    const body = msg.body.trim().toLowerCase();
    const keywords = (settings.completionKeywords ?? []).map((k) =>
      k.toLowerCase(),
    );
    if (!keywords.includes(body)) return;

    const week = await this.prisma.week.findFirst({
      where: { status: WeekStatus.IN_PROGRESS },
      orderBy: { weekNumber: 'desc' },
    });
    if (!week) return;

    // Match by the author id, or by the phone it resolves to (group authors
    // can arrive as "...@lid").
    const phoneWid = await this.wa.resolvePhone(msg.authorWid);
    const member =
      (await this.members.findByWid(msg.authorWid)) ??
      (phoneWid ? await this.members.findByWid(phoneWid) : null);
    if (!member) return; // don't auto-create from a stray keyword

    const hasAllocation = await this.prisma.allocation.count({
      where: { weekId: week.id, memberId: member.id },
    });
    if (hasAllocation === 0) return;

    this.logger.log(
      `Completion via reply from ${member.displayName} ("${msg.body}")`,
    );
    await this.recordCompletion(week.id, member.id, CompletionSource.REPLY);
  }

  // --- completion helpers -------------------------------------------------

  async recordCompletion(
    weekId: string,
    memberId: string,
    source: CompletionSource,
  ): Promise<void> {
    await this.prisma.completionVote.upsert({
      where: { weekId_memberId: { weekId, memberId } },
      update: { source, completedAt: new Date() },
      create: { weekId, memberId, source },
    });
    await this.allocation.setMemberCompletion(weekId, memberId, true);
  }

  async clearCompletion(weekId: string, memberId: string): Promise<void> {
    await this.prisma.completionVote.deleteMany({ where: { weekId, memberId } });
    await this.allocation.setMemberCompletion(weekId, memberId, false);
  }

  /** Manual moderator override of a member's completion. */
  async setCompletionManual(
    weekId: string,
    memberId: string,
    completed: boolean,
  ): Promise<void> {
    if (completed) {
      await this.recordCompletion(weekId, memberId, CompletionSource.MANUAL);
    } else {
      await this.clearCompletion(weekId, memberId);
    }
  }

  /** Completion reconciliation view: who has/hasn't completed their Juz. */
  async completionTally(weekId: string): Promise<{
    completed: number;
    pending: number;
    members: {
      memberId: string;
      memberName: string;
      allocatedJuz: number;
      completed: boolean;
      source: CompletionSource | null;
    }[];
  }> {
    const [allocations, completions] = await Promise.all([
      this.prisma.allocation.findMany({
        where: { weekId },
        include: { member: { select: { displayName: true } } },
      }),
      this.prisma.completionVote.findMany({ where: { weekId } }),
    ]);

    const completionByMember = new Map(
      completions.map((c) => [c.memberId, c.source]),
    );
    const byMember = new Map<
      string,
      { memberName: string; allocatedJuz: number }
    >();
    for (const a of allocations) {
      const cur = byMember.get(a.memberId) ?? {
        memberName: a.member.displayName,
        allocatedJuz: 0,
      };
      cur.allocatedJuz += 1;
      byMember.set(a.memberId, cur);
    }

    // Surface anyone who voted "done" even if they have no allocation yet, so a
    // completion always reflects somewhere (allocatedJuz shows as 0).
    const unallocatedVoters = completions
      .map((c) => c.memberId)
      .filter((id) => !byMember.has(id));
    if (unallocatedVoters.length > 0) {
      const extra = await this.prisma.member.findMany({
        where: { id: { in: unallocatedVoters } },
        select: { id: true, displayName: true },
      });
      for (const m of extra) {
        byMember.set(m.id, { memberName: m.displayName, allocatedJuz: 0 });
      }
    }

    const members = [...byMember.entries()].map(([memberId, info]) => ({
      memberId,
      memberName: info.memberName,
      allocatedJuz: info.allocatedJuz,
      completed: completionByMember.has(memberId),
      source: completionByMember.get(memberId) ?? null,
    }));
    members.sort((a, b) => a.memberName.localeCompare(b.memberName));

    const completed = members.filter((m) => m.completed).length;
    return { completed, pending: members.length - completed, members };
  }
}
