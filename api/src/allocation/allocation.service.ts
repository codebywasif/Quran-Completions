import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AllocationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapacityService } from '../capacity/capacity.service';
import { allocateJuz } from './allocation.algorithm';

export interface AllocationGridQuran {
  quranNumber: number;
  juz: {
    allocationId: string;
    juzNumber: number;
    memberId: string;
    memberName: string;
    status: AllocationStatus;
  }[];
}

@Injectable()
export class AllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CapacityService,
  ) {}

  /**
   * Run the allocation algorithm for a week and persist the result, replacing
   * any previous allocations. Returns the summary + warnings for the dashboard.
   */
  async generate(weekId: string): Promise<{
    totalJuz: number;
    quranCount: number;
    complete: boolean;
    unfilledInLastQuran: number;
    warnings: string[];
  }> {
    const input = await this.capacity.buildAllocationInput(weekId);
    const result = allocateJuz(input);

    await this.prisma.$transaction([
      this.prisma.allocation.deleteMany({ where: { weekId } }),
      this.prisma.allocation.createMany({
        data: result.slots.map((s) => ({
          weekId,
          quranNumber: s.quranNumber,
          juzNumber: s.juzNumber,
          memberId: s.memberId,
          status: AllocationStatus.PENDING,
        })),
      }),
    ]);

    return {
      totalJuz: result.totalJuz,
      quranCount: result.quranCount,
      complete: result.complete,
      unfilledInLastQuran: result.unfilledInLastQuran,
      warnings: result.warnings,
    };
  }

  /** Allocations grouped by Quran, with member names and completion status. */
  async getGrid(weekId: string): Promise<AllocationGridQuran[]> {
    const allocations = await this.prisma.allocation.findMany({
      where: { weekId },
      include: { member: { select: { displayName: true } } },
      orderBy: [{ quranNumber: 'asc' }, { juzNumber: 'asc' }],
    });

    const byQuran = new Map<number, AllocationGridQuran>();
    for (const a of allocations) {
      if (!byQuran.has(a.quranNumber)) {
        byQuran.set(a.quranNumber, { quranNumber: a.quranNumber, juz: [] });
      }
      byQuran.get(a.quranNumber)!.juz.push({
        allocationId: a.id,
        juzNumber: a.juzNumber,
        memberId: a.memberId,
        memberName: a.member.displayName,
        status: a.status,
      });
    }
    return [...byQuran.values()].sort((x, y) => x.quranNumber - y.quranNumber);
  }

  async reassign(allocationId: string, memberId: string): Promise<void> {
    const [allocation, member] = await Promise.all([
      this.prisma.allocation.findUnique({
        where: { id: allocationId },
        include: { week: { select: { status: true } } },
      }),
      this.prisma.member.findUnique({ where: { id: memberId } }),
    ]);
    if (!allocation) throw new NotFoundException(`Allocation not found`);
    if (!member) throw new BadRequestException(`Member ${memberId} not found`);
    // Lock allocations once the list has been sent to the group.
    if (
      allocation.week.status !== 'COLLECTING' &&
      allocation.week.status !== 'ALLOCATING'
    ) {
      throw new BadRequestException(
        'Allocations are locked after the list has been sent to the group.',
      );
    }
    await this.prisma.allocation.update({
      where: { id: allocationId },
      data: { memberId },
    });
  }

  /** Mark (or unmark) all of a member's allocations for the week as completed. */
  async setMemberCompletion(
    weekId: string,
    memberId: string,
    completed: boolean,
  ): Promise<number> {
    const res = await this.prisma.allocation.updateMany({
      where: { weekId, memberId },
      data: {
        status: completed ? AllocationStatus.COMPLETED : AllocationStatus.PENDING,
        completedAt: completed ? new Date() : null,
      },
    });
    return res.count;
  }

  async progress(weekId: string): Promise<{
    totalSlots: number;
    completedSlots: number;
    membersTotal: number;
    membersCompleted: number;
  }> {
    const allocations = await this.prisma.allocation.findMany({
      where: { weekId },
      select: { memberId: true, status: true },
    });
    const members = new Map<string, { total: number; done: number }>();
    let completedSlots = 0;
    for (const a of allocations) {
      const m = members.get(a.memberId) ?? { total: 0, done: 0 };
      m.total += 1;
      if (a.status === AllocationStatus.COMPLETED) {
        m.done += 1;
        completedSlots += 1;
      }
      members.set(a.memberId, m);
    }
    const membersCompleted = [...members.values()].filter(
      (m) => m.total > 0 && m.done === m.total,
    ).length;
    return {
      totalSlots: allocations.length,
      completedSlots,
      membersTotal: members.size,
      membersCompleted,
    };
  }
}
