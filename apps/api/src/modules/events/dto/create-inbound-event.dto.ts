import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import {
  ChannelType,
  InboundEventType,
  InboundProvider,
  Prisma,
} from '@prisma/client';

export class CreateInboundEventDto {
  @IsEnum(InboundProvider)
  provider!: InboundProvider;

  @IsEnum(InboundEventType)
  eventType!: InboundEventType;

  @IsEnum(ChannelType)
  channelType!: ChannelType;

  @IsString()
  dedupKey!: string;

  @IsOptional()
  @IsString()
  externalEventId?: string;

  @IsObject()
  rawPayload!: Prisma.InputJsonObject;
}
