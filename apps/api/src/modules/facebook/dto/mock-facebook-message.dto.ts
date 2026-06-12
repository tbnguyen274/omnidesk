import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class MockFacebookMessageDto {
  @IsString()
  @MinLength(1)
  pageId!: string;

  @IsString()
  @MinLength(1)
  senderId!: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsString()
  @MinLength(1)
  messageId!: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsISO8601()
  sentAt?: string;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsUUID()
  channelAccountId?: string;
}
