import { IsUUID } from 'class-validator';

export class UpdateConversationAssignmentDto {
  @IsUUID()
  assignedAgentId!: string;
}
