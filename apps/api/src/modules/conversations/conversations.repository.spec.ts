import { ConversationsRepository } from './conversations.repository';
import { ConversationStatus, Priority } from '@prisma/client';

describe('ConversationsRepository', () => {
  let repository: ConversationsRepository;
  let prisma: any;
  let outboxService: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      conversation: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
      },
      ticket: {
        update: jest.fn(),
      },
      message: {
        findFirst: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    outboxService = {
      createEvent: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    repository = new ConversationsRepository(prisma, outboxService);
  });

  describe('updateStatus', () => {
    it('updates status and creates CONVERSATION_STATUS_CHANGED outbox event', async () => {
      const existingConv = {
        id: 'conv-1',
        status: ConversationStatus.NEW,
        channelType: 'EMAIL',
        channelAccountId: 'ca-1',
        version: 1,
        ticket: { id: 'ticket-1', slaDueAt: null, slaPausedAt: null },
      };

      const updatedConv = {
        ...existingConv,
        status: ConversationStatus.CLOSED,
        version: 2,
      };

      tx.conversation.findUnique.mockResolvedValueOnce(existingConv);
      tx.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.conversation.findUniqueOrThrow.mockResolvedValueOnce(updatedConv);
      tx.message.findFirst.mockResolvedValueOnce({
        externalMessageId: 'msg-ext-100',
      });

      const result = await repository.updateStatus(
        'conv-1',
        ConversationStatus.CLOSED,
        1,
      );

      expect(result).toEqual(updatedConv);
      expect(outboxService.createEvent).toHaveBeenCalledWith(
        tx,
        'CONVERSATION_STATUS_CHANGED',
        'conv-1',
        {
          conversationId: 'conv-1',
          conversationVersion: 2,
          previousStatus: ConversationStatus.NEW,
          newStatus: ConversationStatus.CLOSED,
          channelType: 'EMAIL',
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-100',
        },
      );
    });
  });

  describe('updatePriority', () => {
    it('updates priority and creates CONVERSATION_PRIORITY_CHANGED outbox event', async () => {
      tx.conversation.findUnique.mockResolvedValueOnce({
        id: 'conv-1',
        priority: Priority.LOW,
        channelType: 'EMAIL',
        channelAccountId: 'ca-1',
      });

      const updatedConv = {
        id: 'conv-1',
        priority: Priority.URGENT,
        channelType: 'EMAIL',
        channelAccountId: 'ca-1',
        version: 2,
        ticket: null,
      };

      tx.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.conversation.findUniqueOrThrow.mockResolvedValueOnce(updatedConv);
      tx.message.findFirst.mockResolvedValueOnce({
        externalMessageId: 'msg-ext-100',
      });

      const result = await repository.updatePriority(
        'conv-1',
        Priority.URGENT,
        1,
      );

      expect(result).toEqual(updatedConv);
      expect(outboxService.createEvent).toHaveBeenCalledWith(
        tx,
        'CONVERSATION_PRIORITY_CHANGED',
        'conv-1',
        {
          conversationId: 'conv-1',
          conversationVersion: 2,
          previousPriority: Priority.LOW,
          newPriority: Priority.URGENT,
          channelType: 'EMAIL',
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-100',
        },
      );
    });
  });

  describe('updateReadStatus', () => {
    it('updates read status and creates CONVERSATION_READ_STATUS_CHANGED outbox event', async () => {
      const updatedConv = {
        id: 'conv-1',
        isRead: true,
        channelType: 'EMAIL',
        channelAccountId: 'ca-1',
        version: 2,
      };

      tx.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.conversation.findUniqueOrThrow.mockResolvedValueOnce(updatedConv);
      tx.message.findFirst.mockResolvedValueOnce({
        externalMessageId: 'msg-ext-100',
      });

      const result = await repository.updateReadStatus('conv-1', true, 1);

      expect(result).toEqual(updatedConv);
      expect(outboxService.createEvent).toHaveBeenCalledWith(
        tx,
        'CONVERSATION_READ_STATUS_CHANGED',
        'conv-1',
        {
          conversationId: 'conv-1',
          conversationVersion: 2,
          isRead: true,
          channelType: 'EMAIL',
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-100',
        },
      );
    });
  });
});
