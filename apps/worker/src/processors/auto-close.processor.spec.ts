import { AutoCloseProcessor } from './auto-close.processor';
import { ChannelType, ConversationStatus } from '@prisma/client';

describe('AutoCloseProcessor', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  let processor: AutoCloseProcessor;
  let prisma: any;
  let tx: any;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'conv-1' }]),
      conversation: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'conv-1',
          status: ConversationStatus.RESOLVED,
          resolvedAt: new Date('2026-10-20'),
          version: 4,
          channelType: ChannelType.EMAIL,
          channelAccountId: 'ca-1',
          ticket: { id: 'ticket-1', isOverdue: true },
        }),
        update: jest.fn().mockResolvedValue({ version: 5 }),
      },
      ticket: { update: jest.fn() },
      message: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ externalMessageId: 'external-1' }),
      },
      outboxEvent: { create: jest.fn() },
    };
    prisma = {
      conversation: {
        findMany: jest.fn().mockResolvedValue([{ id: 'conv-1' }]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    processor = new AutoCloseProcessor(prisma);
  });
  afterEach(() => jest.useRealTimers());
  const run = () =>
    processor.process({
      data: { requestedAt: '2020-01-01T00:00:00Z' },
    } as never);

  it('uses processing time, increments once and writes its outbox atomically', async () => {
    await run();
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resolvedAt: { lt: new Date('2026-10-26T12:00:00Z') },
        }),
      }),
    );
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { status: ConversationStatus.CLOSED, version: { increment: 1 } },
    });
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { isOverdue: false },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            conversationVersion: 5,
            externalMessageId: 'external-1',
          }),
        }),
      }),
    );
  });
  it('rechecks a candidate reopened before the lock and leaves it unchanged', async () => {
    tx.conversation.findUniqueOrThrow.mockResolvedValue({
      status: ConversationStatus.IN_PROGRESS,
      ticket: null,
    });
    await run();
    expect(tx.conversation.update).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });
  it('skips locked rows without blocking interactive traffic', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await run();
    expect(tx.conversation.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });
  it('does not open a transaction for an empty batch', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    await run();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
