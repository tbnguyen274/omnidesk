import {
  Matches,
  MaxLength,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

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
}
