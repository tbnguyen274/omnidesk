import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class UpdateTicketAssignmentDto {
  @IsUUID()
  assignedAgentId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
