import { ConversationsRepository } from './conversations.repository';
import { ConversationStatus, Priority, ChannelType } from '@prisma/client';

describe('ConversationsRepository', () => {
  let repository: ConversationsRepository;
  let prisma: any;
  let outboxService: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn(),
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

    const outboxDispatcher = {
      trigger: jest.fn(),
    };

    repository = new ConversationsRepository(
      prisma,
      outboxService,
      outboxDispatcher as any,
    );
  });

  describe('updateStatus', () => {
    it('updates status and creates CONVERSATION_STATUS_CHANGED outbox event', async () => {
      const existingConv = {
        id: 'conv-1',
        status: ConversationStatus.NEW,
        channelType: ChannelType.EMAIL,
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
          channelType: ChannelType.EMAIL,
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-100',
        },
      );
    });
  });

  it('does not create another version or outbox intent for repeated waiting status', async () => {
    const current = {
      id: 'conv-1',
      version: 3,
      status: ConversationStatus.WAITING_CUSTOMER,
      ticket: {
        id: 'ticket-1',
        slaPausedAt: new Date('2026-10-28'),
        slaDueAt: new Date('2026-10-30'),
        isOverdue: false,
      },
    };
    tx.conversation.findUnique.mockResolvedValue(current);
    await expect(
      repository.updateStatus('conv-1', ConversationStatus.WAITING_CUSTOMER, 3),
    ).resolves.toEqual(current);
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.ticket.update).not.toHaveBeenCalled();
    expect(outboxService.createEvent).not.toHaveBeenCalled();
    await expect(
      repository.updateStatus('conv-1', ConversationStatus.WAITING_CUSTOMER, 2),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('clears a stale overdue flag without sending a fake status-change event', async () => {
    const current = {
      id: 'conv-1',
      version: 1,
      status: ConversationStatus.RESOLVED,
      ticket: { id: 'ticket-1', isOverdue: true },
    };
    tx.conversation.findUnique.mockResolvedValue(current);
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });
    tx.conversation.findUniqueOrThrow.mockResolvedValue({
      ...current,
      version: 2,
    });
    await repository.updateStatus('conv-1', ConversationStatus.RESOLVED, 1);
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { isOverdue: false },
    });
    expect(outboxService.createEvent).not.toHaveBeenCalled();
  });

  it.each(['priority', 'read', 'assignment'] as const)(
    'keeps version stable on unchanged %s and still rejects stale clients',
    async (action) => {
      const current = {
        id: 'conv-1',
        version: 2,
        priority: Priority.LOW,
        isRead: true,
        assignedAgentId: null,
      };
      tx.conversation.findUnique.mockResolvedValue(current);
      tx.conversation.findUniqueOrThrow.mockResolvedValue(current);
      const run = (version: number) =>
        ({
          priority: () =>
            repository.updatePriority('conv-1', Priority.LOW, version),
          read: () => repository.updateReadStatus('conv-1', true, version),
          assignment: () =>
            repository.updateAssignment('conv-1', null, version),
        })[action]();
      await run(2);
      expect(tx.conversation.updateMany).not.toHaveBeenCalled();
      expect(outboxService.createEvent).not.toHaveBeenCalled();
      await expect(run(1)).rejects.toMatchObject({ status: 409 });
    },
  );

  describe('updatePriority', () => {
    it('updates priority and creates CONVERSATION_PRIORITY_CHANGED outbox event', async () => {
      tx.conversation.findUnique.mockResolvedValueOnce({
        id: 'conv-1',
        priority: Priority.LOW,
        version: 1,
        channelType: ChannelType.EMAIL,
        channelAccountId: 'ca-1',
      });

      const updatedConv = {
        id: 'conv-1',
        priority: Priority.URGENT,
        channelType: ChannelType.EMAIL,
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
          channelType: ChannelType.EMAIL,
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
        channelType: ChannelType.EMAIL,
        channelAccountId: 'ca-1',
        version: 2,
      };

      tx.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.conversation.findUniqueOrThrow.mockResolvedValueOnce(updatedConv);
      tx.message.findFirst.mockResolvedValueOnce({
        externalMessageId: 'msg-ext-100',
      });

      tx.conversation.findUnique.mockResolvedValueOnce({
        ...updatedConv,
        version: 1,
        isRead: false,
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
          channelType: ChannelType.EMAIL,
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-100',
        },
      );
    });
  });
});
