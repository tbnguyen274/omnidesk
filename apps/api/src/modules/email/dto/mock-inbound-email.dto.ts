import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MessageContentType } from '@prisma/client';

export class MockInboundEmailDto {
  @IsString()
  @MinLength(1)
  mailbox!: string;

  @IsString()
  @MinLength(1)
  messageId!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsEmail()
  toEmail?: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @ValidateIf((dto: MockInboundEmailDto) => !dto.html)
  @IsString()
  @MinLength(1)
  text?: string;

  @ValidateIf((dto: MockInboundEmailDto) => !dto.text)
  @IsString()
  @MinLength(1)
  html?: string;

  @IsOptional()
  @IsIn([MessageContentType.TEXT, MessageContentType.HTML])
  contentType?: Extract<MessageContentType, 'TEXT' | 'HTML'>;

  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  inReplyTo?: string;

  @IsOptional()
  @IsUUID()
  channelAccountId?: string;
}
