import { Type } from 'class-transformer';
import { IsEnum, IsInt, Min } from 'class-validator';
import { ConversationStatus } from '@prisma/client';

export class UpdateTicketStatusDto {
  @IsEnum(ConversationStatus)
  status!: ConversationStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
