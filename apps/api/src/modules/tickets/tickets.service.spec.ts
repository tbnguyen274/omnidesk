import { ConversationStatus } from '@prisma/client';
import { TicketsService } from './tickets.service';

describe('TicketsService mutations', () => {
  function createService() {
    const ticketsRepository = {
      findExistingById: jest.fn().mockResolvedValue({
        id: 'ticket-id',
        conversationId: 'conversation-id',
        conversation: { version: 3 },
      }),
      findById: jest.fn().mockResolvedValue({
        id: 'ticket-id',
        conversationId: 'conversation-id',
        conversation: {
          id: 'conversation-id',
          status: ConversationStatus.RESOLVED,
          priority: 'HIGH',
          assignedAgentId: null,
          assignedAgent: null,
          resolvedAt: new Date(),
        },
      }),
    };
    const notifications = {
      publishToConversation: jest.fn(),
      publishToAgent: jest.fn(),
    };
    const conversationsService = {
      updateStatus: jest.fn().mockResolvedValue({ id: 'conversation-id' }),
      updateAssignment: jest.fn().mockResolvedValue({ id: 'conversation-id' }),
    };

    return {
      service: new TicketsService(
        ticketsRepository as never,
        notifications as never,
        conversationsService as never,
      ),
      ticketsRepository,
      notifications,
      conversationsService,
    };
  }

  it('routes status updates through the conversation aggregate with OCC', async () => {
    const { service, conversationsService, ticketsRepository } =
      createService();

    await expect(
      service.updateStatus('ticket-id', ConversationStatus.RESOLVED, 3),
    ).resolves.toMatchObject({ id: 'ticket-id' });

    expect(conversationsService.updateStatus).toHaveBeenCalledWith(
      'conversation-id',
      ConversationStatus.RESOLVED,
      3,
    );
    expect(ticketsRepository.findById).toHaveBeenCalledWith('ticket-id');
  });

  it('routes assignment updates through the conversation aggregate', async () => {
    const { service, conversationsService, notifications } = createService();

    await service.updateAssignment('ticket-id', 'agent-id', 3);

    expect(conversationsService.updateAssignment).toHaveBeenCalledWith(
      'conversation-id',
      'agent-id',
      3,
    );
    expect(notifications.publishToAgent).toHaveBeenCalledWith(
      'agent-id',
      expect.objectContaining({ ticketId: 'ticket-id' }),
    );
  });
});
