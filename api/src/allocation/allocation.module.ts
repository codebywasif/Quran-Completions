import { Module } from '@nestjs/common';
import { CapacityModule } from '../capacity/capacity.module';
import { AllocationService } from './allocation.service';
import { AllocationController } from './allocation.controller';

@Module({
  imports: [CapacityModule],
  providers: [AllocationService],
  controllers: [AllocationController],
  exports: [AllocationService],
})
export class AllocationModule {}
