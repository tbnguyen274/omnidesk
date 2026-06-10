import { IsEnum } from 'class-validator';
import { Priority } from '@prisma/client';

export class UpdateConversationPriorityDto {
  @IsEnum(Priority)
  priority!: Priority;
}
