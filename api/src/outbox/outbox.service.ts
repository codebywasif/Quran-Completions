import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OutboxMessage,
  OutboxStatus,
  OutboxType,
  PollKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WaService } from '../wa/wa.service';
import { VoteService } from '../vote/vote.service';
import { CAPACITY_OPTIONS } from '../capacity/capacity.service';

const POLL_TYPES: OutboxType[] = ['CAPACITY_POLL', 'COMPLETION_POLL'];

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly wa: WaService,
    private readonly votes: VoteService,
  ) {}

  create(
    weekId: string,
    type: OutboxType,
    content: string,
    opts?: {
      status?: OutboxStatus;
      scheduledFor?: Date | null;
      requiresApproval?: boolean;
    },
  ): Promise<OutboxMessage> {
    return this.prisma.outboxMessage.create({
      data: {
        weekId,
        type,
        content,
        status: opts?.status ?? OutboxStatus.DRAFT,
        scheduledFor: opts?.scheduledFor ?? null,
        requiresApproval: opts?.requiresApproval ?? false,
      },
    });
  }

  list(filter?: {
    weekId?: string;
    status?: OutboxStatus;
  }): Promise<OutboxMessage[]> {
    return this.prisma.outboxMessage.findMany({
      where: { weekId: filter?.weekId, status: filter?.status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string): Promise<OutboxMessage> {
    const msg = await this.prisma.outboxMessage.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException(`Outbox message ${id} not found`);
    return msg;
  }

  async updateContent(id: string, content: string): Promise<OutboxMessage> {
    const msg = await this.get(id);
    if (msg.status === OutboxStatus.SENT) {
      throw new BadRequestException('Cannot edit an already-sent message');
    }
    return this.prisma.outboxMessage.update({
      where: { id },
      data: { content },
    });
  }

  async cancel(id: string): Promise<OutboxMessage> {
    const msg = await this.get(id);
    if (msg.status === OutboxStatus.SENT) {
      throw new BadRequestException('Cannot cancel an already-sent message');
    }
    return this.prisma.outboxMessage.update({
      where: { id },
      data: { status: OutboxStatus.CANCELLED },
    });
  }

  /** Approve a pending message (records approval, then sends). */
  async approve(id: string): Promise<OutboxMessage> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: { approvedAt: new Date() },
    });
    return this.send(id);
  }

  /** Send a single outbox message via WhatsApp. */
  async send(id: string): Promise<OutboxMessage> {
    const msg = await this.get(id);
    if (msg.status === OutboxStatus.SENT) return msg;
    if (msg.status === OutboxStatus.CANCELLED) {
      throw new BadRequestException('Cannot send a cancelled message');
    }

    const { groupChatId, fivePlusValue } = await this.settings.get();
    if (!groupChatId) {
      throw new BadRequestException(
        'No WhatsApp group configured (set it in Settings first).',
      );
    }

    try {
      let waMessageId: string;
      if (msg.type === 'CAPACITY_POLL') {
        waMessageId = await this.wa.sendPoll(
          groupChatId,
          msg.content,
          [...CAPACITY_OPTIONS],
        );
        await this.votes.registerPoll(msg.weekId, PollKind.CAPACITY, waMessageId, {
          '1': 1,
          '2': 2,
          '3': 3,
          '4': 4,
          '5': 5,
          '5+': fivePlusValue,
        });
      } else if (msg.type === 'COMPLETION_POLL') {
        waMessageId = await this.wa.sendPoll(groupChatId, msg.content, [
          'Yes',
          'No',
        ]);
        await this.votes.registerPoll(
          msg.weekId,
          PollKind.COMPLETION,
          waMessageId,
          { Yes: 1, No: 0 },
        );
      } else {
        waMessageId = await this.wa.sendText(groupChatId, msg.content);
      }

      return await this.prisma.outboxMessage.update({
        where: { id },
        data: {
          status: OutboxStatus.SENT,
          sentAt: new Date(),
          waMessageId,
          error: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send outbox ${id} (${msg.type}): ${message}`);
      await this.prisma.outboxMessage.update({
        where: { id },
        data: { status: OutboxStatus.FAILED, error: message },
      });
      throw new BadRequestException(`Send failed: ${message}`);
    }
  }

  static isPollType(type: OutboxType): boolean {
    return POLL_TYPES.includes(type);
  }
}
