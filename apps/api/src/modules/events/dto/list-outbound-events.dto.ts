import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OutboundMessageStatus, OutboundProvider } from '@prisma/client';

export class ListOutboundEventsDto {
  @IsOptional()
  @IsEnum(OutboundProvider)
  provider?: OutboundProvider;

  @IsOptional()
  @IsEnum(OutboundMessageStatus)
  status?: OutboundMessageStatus;

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
