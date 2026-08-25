import { Type } from 'class-transformer';
import {
  Matches,
  MaxLength,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  IsUrl,
  IsNumber,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

export class OutboundAttachmentItemDto {
  @IsString()
  url!: string;

  @IsString()
  fileName!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsNumber()
  sizeBytes?: number;
}

export class CreateOutboundMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsString()
  @Matches(/\S/, { message: 'content must contain a non-whitespace character' })
  @MaxLength(10_000)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUrl({ require_tld: false }, { each: true })
  @ArrayMaxSize(10)
  attachmentUrls?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutboundAttachmentItemDto)
  attachments?: OutboundAttachmentItemDto[];
}
