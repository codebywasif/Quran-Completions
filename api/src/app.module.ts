import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WaModule } from './wa/wa.module';
import { SettingsModule } from './settings/settings.module';
import { MembersModule } from './members/members.module';
import { WeekModule } from './week/week.module';
import { CapacityModule } from './capacity/capacity.module';
import { AllocationModule } from './allocation/allocation.module';
import { VoteModule } from './vote/vote.module';
import { TemplateModule } from './template/template.module';
import { OutboxModule } from './outbox/outbox.module';
import { CycleModule } from './cycle/cycle.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    WaModule,
    SettingsModule,
    MembersModule,
    WeekModule,
    CapacityModule,
    AllocationModule,
    VoteModule,
    TemplateModule,
    OutboxModule,
    CycleModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
