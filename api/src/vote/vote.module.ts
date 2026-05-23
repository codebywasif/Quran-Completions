import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { CapacityModule } from '../capacity/capacity.module';
import { AllocationModule } from '../allocation/allocation.module';
import { VoteService } from './vote.service';
import { VoteController } from './vote.controller';

@Module({
  imports: [MembersModule, CapacityModule, AllocationModule],
  providers: [VoteService],
  controllers: [VoteController],
  exports: [VoteService],
})
export class VoteModule {}
