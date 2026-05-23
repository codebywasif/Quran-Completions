import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateMemberDto {
  @IsString()
  @MinLength(1)
  displayName!: string;

  /** Phone or full WhatsApp id; normalised to "<digits>@c.us" if needed. */
  @IsOptional()
  @IsString()
  whatsappId?: string;

  @IsOptional()
  @IsString()
  lidId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsString()
  whatsappId?: string;

  @IsOptional()
  @IsString()
  lidId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  provisional?: boolean;
}
