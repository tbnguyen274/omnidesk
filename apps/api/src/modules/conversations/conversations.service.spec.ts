import { ConversationsService } from './conversations.service';
import { BadRequestException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

describe('ConversationsService', () => {
  it('returns paginated conversations', async () => {
    const conversation = {
      id: 'conversation-id',
      channelType: 'EMAIL',
      subject: 'Billing issue',
      status: 'NEW',
      priority: 'HIGH',
      assignedAgent: null,
      ticket: null,
      lastMessageAt: new Date(),
      customer: {
        id: 'customer-id',
        name: 'Customer',
        email: 'customer@example.com',
        avatarUrl: null,
      },
      messages: [
        {
          id: 'message-id',
          content: 'I need help',
          contentType: 'TEXT',
          direction: 'INBOUND',
          createdAt: new Date(),
        },
      ],
    };
    const conversationsRepository = {
      list: jest.fn().mockResolvedValue([[conversation], 1]),
    };
    const notificationsService = {
      publish: jest.fn(),
    };
    const queuesService = {
      add: jest.fn(),
    };

    const service = new ConversationsService(
      conversationsRepository as never,
      notificationsService as never,
    );
    await expect(service.list({ page: 1, limit: 20 })).resolves.toMatchObject({
      items: [
        {
          id: 'conversation-id',
          customer: {
            email: 'customer@example.com',
          },
          lastMessage: {
            content: 'I need help',
          },
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });
  });

  it('rejects assigning an administrator to a conversation', async () => {
    const conversationsRepository = {
      findExistingById: jest.fn().mockResolvedValue({ id: 'conversation-id' }),
      findAssignableUser: jest.fn().mockResolvedValue({
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      }),
      updateAssignment: jest.fn(),
    };
    const service = new ConversationsService(
      conversationsRepository as never,
      { publishToConversation: jest.fn() } as never,
    );

    await expect(
      service.updateAssignment('conversation-id', 'admin-id', 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(conversationsRepository.updateAssignment).not.toHaveBeenCalled();
  });
});
