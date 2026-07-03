import { IsUUID, IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateConversationAssignmentDto {
  @IsOptional()
  @IsUUID()
  assignedAgentId!: string | null;

  @IsNumber()
  @IsNotEmpty()
  version!: number;
}
