import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Member } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Normalise a phone/id to a WhatsApp contact id ("<digits>@c.us"). */
  static normalizeWid(input?: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.includes('@')) return trimmed;
    const digits = trimmed.replace(/[^\d]/g, '');
    return digits.length > 0 ? `${digits}@c.us` : null;
  }

  list(opts?: { activeOnly?: boolean }): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: opts?.activeOnly ? { active: true } : undefined,
      orderBy: { displayName: 'asc' },
    });
  }

  async get(id: string): Promise<Member> {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    return member;
  }

  async create(dto: CreateMemberDto): Promise<Member> {
    const whatsappId = MembersService.normalizeWid(dto.whatsappId);
    await this.assertWidFree(whatsappId, dto.lidId ?? null);
    return this.prisma.member.create({
      data: {
        displayName: dto.displayName,
        whatsappId,
        lidId: dto.lidId ?? null,
        aliases: dto.aliases ?? [],
        country: dto.country ?? null,
        active: dto.active ?? true,
        provisional: false,
      },
    });
  }

  async update(id: string, dto: UpdateMemberDto): Promise<Member> {
    await this.get(id);
    const whatsappId =
      dto.whatsappId !== undefined
        ? MembersService.normalizeWid(dto.whatsappId)
        : undefined;
    if (whatsappId !== undefined || dto.lidId !== undefined) {
      await this.assertWidFree(whatsappId ?? null, dto.lidId ?? null, id);
    }
    return this.prisma.member.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        whatsappId,
        lidId: dto.lidId,
        aliases: dto.aliases,
        country: dto.country,
        active: dto.active,
        provisional: dto.provisional,
      },
    });
  }

  /** Hard-delete a member; blocked if they hold allocations (deactivate instead). */
  async remove(id: string): Promise<void> {
    await this.get(id);
    const allocations = await this.prisma.allocation.count({
      where: { memberId: id },
    });
    if (allocations > 0) {
      throw new ConflictException(
        'Member has Juz allocations; deactivate them instead of deleting.',
      );
    }
    await this.prisma.member.delete({ where: { id } });
  }

  /** Find a member by either WhatsApp id form (@c.us or @lid). */
  findByWid(wid: string): Promise<Member | null> {
    return this.prisma.member.findFirst({
      where: { OR: [{ whatsappId: wid }, { lidId: wid }] },
    });
  }

  /**
   * Resolve a voter's WhatsApp id to a member. If a `phoneWid` (resolved from a
   * "...@lid" voter) is supplied and matches a member already in the roster,
   * the LID is linked onto that member so they show their real name and match
   * directly forever after. Otherwise a provisional member is created, labelled
   * by phone number when known. Handles both "...@c.us" and "...@lid" forms.
   */
  async findOrCreateProvisional(
    wid: string,
    phoneWid?: string | null,
  ): Promise<Member> {
    const phone = MembersService.normalizeWid(phoneWid ?? undefined);
    const isLid = wid.endsWith('@lid');

    // Already known by this exact id.
    const existing = await this.findByWid(wid);
    if (existing) {
      // Backfill the phone if we just learned it and it's free (existing was
      // matched by lidId, so it has no whatsappId yet).
      if (phone && !existing.whatsappId) {
        const clash = await this.prisma.member.findUnique({
          where: { whatsappId: phone },
        });
        if (!clash) {
          try {
            return await this.prisma.member.update({
              where: { id: existing.id },
              data: { whatsappId: phone },
            });
          } catch (e) {
            this.logger.warn(`phone backfill failed: ${String(e)}`);
          }
        }
      }
      return existing;
    }

    // Link a new @lid voter to a roster member matched by phone number.
    if (phone) {
      const byPhone = await this.findByWid(phone);
      if (byPhone) {
        if (isLid && !byPhone.lidId) {
          try {
            const linked = await this.prisma.member.update({
              where: { id: byPhone.id },
              data: { lidId: wid },
            });
            this.logger.log(
              `Linked ${wid} → ${linked.displayName} (${phone})`,
            );
            return linked;
          } catch (e) {
            this.logger.warn(`lid link failed: ${String(e)}`);
          }
        }
        return byPhone;
      }
    }

    // No roster match — create a provisional member, labelled by phone if known.
    const labelNumber = (phone ?? wid).split('@')[0];
    const data = {
      displayName: `Unknown (${labelNumber})`,
      whatsappId: isLid ? phone : wid,
      lidId: isLid ? wid : null,
      provisional: true,
      active: true,
    };
    try {
      return await this.prisma.member.create({ data });
    } catch {
      // Concurrent create or unique clash — re-resolve, else create unlinked.
      const retry = await this.findByWid(wid);
      if (retry) return retry;
      return this.prisma.member.create({
        data: { ...data, whatsappId: isLid ? null : wid },
      });
    }
  }

  /** Members auto-created from votes that the moderator hasn't confirmed yet. */
  listProvisional(): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: { provisional: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertWidFree(
    whatsappId: string | null,
    lidId: string | null,
    excludeId?: string,
  ): Promise<void> {
    if (whatsappId) {
      const clash = await this.prisma.member.findUnique({
        where: { whatsappId },
      });
      if (clash && clash.id !== excludeId) {
        throw new ConflictException(
          `WhatsApp id ${whatsappId} already belongs to ${clash.displayName}`,
        );
      }
    }
    if (lidId) {
      const clash = await this.prisma.member.findUnique({ where: { lidId } });
      if (clash && clash.id !== excludeId) {
        throw new ConflictException(
          `LID ${lidId} already belongs to ${clash.displayName}`,
        );
      }
    }
  }
}
