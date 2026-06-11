import { IsOptional, IsUUID } from 'class-validator';

export class CreateEmailSyncDto {
  @IsOptional()
  @IsUUID()
  channelAccountId?: string;
}
