import { IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationReadStatusDto {
  @ApiProperty()
  @IsBoolean()
  isRead: boolean;

  @ApiProperty()
  @IsNumber()
  version: number;
}
