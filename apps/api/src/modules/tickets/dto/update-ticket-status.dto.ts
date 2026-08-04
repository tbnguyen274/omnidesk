import { Type } from 'class-transformer';
import { IsEnum, IsInt, Min } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
