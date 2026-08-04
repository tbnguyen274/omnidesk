import { ConversationStatus, Priority, TicketStatus } from '@prisma/client';
import { getExpectedTicketProjection } from './ticket-consistency';

describe('getExpectedTicketProjection', () => {
  it('projects an assigned new conversation as an assigned ticket', () => {
    expect(
      getExpectedTicketProjection({
        status: ConversationStatus.NEW,
        priority: Priority.HIGH,
        assignedAgentId: 'agent-id',
      }),
    ).toEqual({
      status: TicketStatus.ASSIGNED,
      priority: Priority.HIGH,
      assignedAgentId: 'agent-id',
    });
  });

  it('preserves lifecycle status independently of assignment', () => {
    expect(
      getExpectedTicketProjection({
        status: ConversationStatus.RESOLVED,
        priority: Priority.MEDIUM,
        assignedAgentId: 'agent-id',
      }),
    ).toEqual({
      status: TicketStatus.RESOLVED,
      priority: Priority.MEDIUM,
      assignedAgentId: 'agent-id',
    });
  });
});
