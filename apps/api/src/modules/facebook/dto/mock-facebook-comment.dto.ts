import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class MockFacebookCommentDto {
  @IsString()
  @MinLength(1)
  pageId!: string;

  @IsString()
  @MinLength(1)
  postId!: string;

  @IsString()
  @MinLength(1)
  commentId!: string;

  @IsString()
  @MinLength(1)
  commenterId!: string;

  @IsOptional()
  @IsString()
  commenterName?: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsISO8601()
  sentAt?: string;

  @IsOptional()
  @IsString()
  parentCommentId?: string;

  @IsOptional()
  @IsUUID()
  channelAccountId?: string;
}
