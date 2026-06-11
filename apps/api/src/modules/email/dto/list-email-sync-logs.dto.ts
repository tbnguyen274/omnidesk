import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { EmailSyncStatus } from '@prisma/client';

export class ListEmailSyncLogsDto {
  @IsOptional()
  @IsUUID()
  channelAccountId?: string;

  @IsOptional()
  @IsEnum(EmailSyncStatus)
  status?: EmailSyncStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
