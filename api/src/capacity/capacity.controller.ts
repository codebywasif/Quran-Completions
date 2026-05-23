import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CapacityService } from './capacity.service';

class UpsertVoteDto {
  @IsString()
  memberId!: string;

  /** Poll option label: "1".."5" or "5+". */
  @IsString()
  label!: string;
}

class UpsertRequestDto {
  @IsString()
  memberId!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(30, { each: true })
  requestedJuz!: number[];

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('weeks/:weekId')
export class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  @Get('votes')
  listVotes(@Param('weekId') weekId: string) {
    return this.capacity.listVotes(weekId);
  }

  @Get('votes/tally')
  tally(@Param('weekId') weekId: string) {
    return this.capacity.tally(weekId);
  }

  @Put('votes')
  upsertVote(@Param('weekId') weekId: string, @Body() dto: UpsertVoteDto) {
    return this.capacity.upsertVote(weekId, dto.memberId, dto.label);
  }

  @Delete('votes/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVote(
    @Param('weekId') weekId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.capacity.removeVote(weekId, memberId);
  }

  @Get('requests')
  listRequests(@Param('weekId') weekId: string) {
    return this.capacity.listRequests(weekId);
  }

  @Put('requests')
  upsertRequest(
    @Param('weekId') weekId: string,
    @Body() dto: UpsertRequestDto,
  ) {
    return this.capacity.upsertRequest(
      weekId,
      dto.memberId,
      dto.requestedJuz,
      dto.note,
    );
  }

  @Delete('requests/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRequest(
    @Param('weekId') weekId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.capacity.removeRequest(weekId, memberId);
  }
}
