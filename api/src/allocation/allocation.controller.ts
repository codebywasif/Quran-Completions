import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AllocationService } from './allocation.service';

class ReassignDto {
  @IsString()
  memberId!: string;
}

@Controller('weeks/:weekId/allocation')
export class AllocationController {
  constructor(private readonly allocation: AllocationService) {}

  @Get()
  grid(@Param('weekId') weekId: string) {
    return this.allocation.getGrid(weekId);
  }

  @Get('progress')
  progress(@Param('weekId') weekId: string) {
    return this.allocation.progress(weekId);
  }

  /** Run the auto-allocation algorithm (replaces existing allocations). */
  @Post('generate')
  generate(@Param('weekId') weekId: string) {
    return this.allocation.generate(weekId);
  }

  @Put(':allocationId')
  reassign(
    @Param('allocationId') allocationId: string,
    @Body() dto: ReassignDto,
  ) {
    return this.allocation.reassign(allocationId, dto.memberId);
  }
}
