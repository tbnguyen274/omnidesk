import { IsEnum, IsNumber, IsNotEmpty } from 'class-validator';
import { Priority } from '@prisma/client';

export class UpdateConversationPriorityDto {
  @IsEnum(Priority)
  priority!: Priority;

  @IsNumber()
  @IsNotEmpty()
  version!: number;
}
