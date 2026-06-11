import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ChannelType, OutboundProvider } from '@prisma/client';

export class CreateOutboundMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsEnum(ChannelType)
  channelType!: ChannelType;

  @IsEnum(OutboundProvider)
  provider!: OutboundProvider;

  @IsOptional()
  @IsString()
  recipientExternalId?: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
