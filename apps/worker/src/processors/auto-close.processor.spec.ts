import { AutoCloseProcessor } from './auto-close.processor';
import { ChannelType, ConversationStatus } from '@prisma/client';

describe('AutoCloseProcessor', () => {
  let processor: AutoCloseProcessor;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      conversation: {
        updateMany: jest.fn(),
      },
      message: {
        findFirst: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
    };

    prisma = {
      conversation: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };

    processor = new AutoCloseProcessor(prisma);
  });

  it('returns early when no resolved conversations are found', async () => {
    prisma.conversation.findMany.mockResolvedValueOnce([]);

    await processor.process({
      data: { requestedAt: new Date().toISOString() },
    } as any);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('auto-closes resolved conversations and creates outbox events', async () => {
    const requestedAt = new Date('2026-08-31T12:00:00Z');
    prisma.conversation.findMany.mockResolvedValueOnce([
      {
        id: 'conv-1',
        channelType: ChannelType.EMAIL,
        channelAccountId: 'ca-1',
      },
    ]);

    tx.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.message.findFirst.mockResolvedValueOnce({
      externalMessageId: 'msg-ext-123',
    });

    await processor.process({
      data: { requestedAt: requestedAt.toISOString() },
    } as any);

    expect(tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'conv-1',
          status: ConversationStatus.RESOLVED,
        }),
        data: { status: ConversationStatus.CLOSED },
      }),
    );

    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'CONVERSATION_STATUS_CHANGED',
        aggregateId: 'conv-1',
        payload: {
          conversationId: 'conv-1',
          previousStatus: ConversationStatus.RESOLVED,
          newStatus: ConversationStatus.CLOSED,
          channelType: ChannelType.EMAIL,
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-123',
        },
      },
    });
  });

  it('prevents race condition: does not emit outbox event when conversation was reopened', async () => {
    prisma.conversation.findMany.mockResolvedValueOnce([
      {
        id: 'conv-reopened',
        channelType: ChannelType.EMAIL,
        channelAccountId: 'ca-1',
      },
    ]);

    // Conditional update returns 0 because status is no longer RESOLVED
    tx.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

    await processor.process({
      data: { requestedAt: new Date().toISOString() },
    } as any);

    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
