import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PollKind } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsString,
} from 'class-validator';
import { VoteService } from './vote.service';

class SetCompletionDto {
  @IsString()
  memberId!: string;

  @IsBoolean()
  completed!: boolean;
}

class RegisterPollDto {
  @IsIn(Object.values(PollKind))
  kind!: PollKind;

  @IsString()
  waMessageId!: string;

  @IsObject()
  optionMap!: Record<string, number>;
}

@Controller('weeks/:weekId')
export class VoteController {
  constructor(private readonly votes: VoteService) {}

  @Get('completion')
  completion(@Param('weekId') weekId: string) {
    return this.votes.completionTally(weekId);
  }

  @Put('completion')
  async setCompletion(
    @Param('weekId') weekId: string,
    @Body() dto: SetCompletionDto,
  ) {
    await this.votes.setCompletionManual(weekId, dto.memberId, dto.completed);
    return this.votes.completionTally(weekId);
  }

  @Post('polls')
  registerPoll(@Param('weekId') weekId: string, @Body() dto: RegisterPollDto) {
    return this.votes.registerPoll(
      weekId,
      dto.kind,
      dto.waMessageId,
      dto.optionMap,
    );
  }
}
