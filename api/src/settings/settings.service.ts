import { Injectable } from '@nestjs/common';
import { Prisma, Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SINGLETON_ID = 'singleton';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Load the settings singleton, creating it with defaults if absent. */
  async get(): Promise<Setting> {
    const existing = await this.prisma.setting.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) return existing;
    return this.prisma.setting.create({ data: { id: SINGLETON_ID } });
  }

  async update(patch: Prisma.SettingUpdateInput): Promise<Setting> {
    await this.get();
    return this.prisma.setting.update({
      where: { id: SINGLETON_ID },
      data: patch,
    });
  }
}
