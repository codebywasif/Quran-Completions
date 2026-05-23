import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendTextDto {
  @IsString()
  @MinLength(1)
  chatId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;
}

export class SendPollDto {
  @IsString()
  @MinLength(1)
  chatId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  options!: string[];

  @IsOptional()
  @IsBoolean()
  allowMultipleAnswers?: boolean;
}

export class SimulateVoteDto {
  @IsString()
  pollMessageId!: string;

  @IsString()
  voterWid!: string;

  @IsArray()
  @IsString({ each: true })
  selectedOptions!: string[];
}

export class SimulateMessageDto {
  @IsString()
  chatId!: string;

  @IsString()
  authorWid!: string;

  @IsString()
  body!: string;
}
