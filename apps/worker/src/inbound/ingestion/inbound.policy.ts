import { calculateSlaDueAt } from '@omnidesk/shared';
import type { ConversationStatus, Priority } from '@omnidesk/shared';

/** Preserve existing lifecycle behavior. WAITING_CUSTOMER resume is separate work. */
export function decideInboundConversation(status?: ConversationStatus) {
  return {
    createNew: !status || status === 'CLOSED',
    reopen: status === 'RESOLVED',
  };
}

export function initialTicketDeadline(
  ticketExists: boolean,
  priority: Priority,
  receivedAt: Date,
): Date | null {
  return ticketExists ? null : calculateSlaDueAt(priority, receivedAt);
}
