import { IsUUID } from 'class-validator';

export class UpdateTicketAssignmentDto {
  @IsUUID()
  assignedAgentId!: string;
}
