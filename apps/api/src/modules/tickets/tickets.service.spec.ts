import { BadRequestException } from '@nestjs/common';
import { ConversationStatus, TicketStatus } from '@prisma/client';
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
      service.updateStatus('ticket-id', TicketStatus.RESOLVED, 3),
    ).resolves.toMatchObject({ id: 'ticket-id' });

    expect(conversationsService.updateStatus).toHaveBeenCalledWith(
      'conversation-id',
      ConversationStatus.RESOLVED,
      3,
    );
    expect(ticketsRepository.findById).toHaveBeenCalledWith('ticket-id');
  });

  it('requires the assignment endpoint for ASSIGNED transitions', async () => {
    const { service, conversationsService } = createService();

    await expect(
      service.updateStatus('ticket-id', TicketStatus.ASSIGNED, 3),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(conversationsService.updateStatus).not.toHaveBeenCalled();
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
