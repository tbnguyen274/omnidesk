import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  InboundEventStatus,
  InboundEventType,
  InboundProvider,
} from '@prisma/client';

export class ListInboundEventsDto {
  @IsOptional()
  @IsEnum(InboundProvider)
  provider?: InboundProvider;

  @IsOptional()
  @IsEnum(InboundEventType)
  eventType?: InboundEventType;

  @IsOptional()
  @IsEnum(InboundEventStatus)
  status?: InboundEventStatus;

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
