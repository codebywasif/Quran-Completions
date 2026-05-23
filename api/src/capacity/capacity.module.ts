import { Module } from '@nestjs/common';
import { CapacityService } from './capacity.service';
import { CapacityController } from './capacity.controller';

@Module({
  providers: [CapacityService],
  controllers: [CapacityController],
  exports: [CapacityService],
})
export class CapacityModule {}
