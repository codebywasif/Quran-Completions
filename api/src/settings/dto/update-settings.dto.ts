import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  groupChatId?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  timesTable?: string;

  @IsOptional()
  templates?: Record<string, string>;

  @IsOptional()
  schedule?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  fivePlusValue?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  countriesOverride?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completionKeywords?: string[];
}
