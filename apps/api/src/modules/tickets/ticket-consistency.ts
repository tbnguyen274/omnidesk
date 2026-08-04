import { ConversationStatus, Priority, TicketStatus } from '@prisma/client';

export type ConversationTicketProjection = {
  status: ConversationStatus;
  priority: Priority;
  assignedAgentId: string | null;
};

export function toTicketStatus(status: ConversationStatus): TicketStatus {
  const statusMap: Record<ConversationStatus, TicketStatus> = {
    [ConversationStatus.NEW]: TicketStatus.NEW,
    [ConversationStatus.IN_PROGRESS]: TicketStatus.IN_PROGRESS,
    [ConversationStatus.WAITING_CUSTOMER]: TicketStatus.WAITING_CUSTOMER,
    [ConversationStatus.RESOLVED]: TicketStatus.RESOLVED,
    [ConversationStatus.CLOSED]: TicketStatus.CLOSED,
  };

  return statusMap[status];
}

export function getExpectedTicketProjection(
  conversation: ConversationTicketProjection,
) {
  return {
    status:
      conversation.status === ConversationStatus.NEW &&
      conversation.assignedAgentId
        ? TicketStatus.ASSIGNED
        : toTicketStatus(conversation.status),
    priority: conversation.priority,
    assignedAgentId: conversation.assignedAgentId,
  };
}
