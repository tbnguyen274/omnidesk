import { SlaCheckProcessor } from './sla-check.processor';
import { ConversationStatus } from '@prisma/client';

describe('SlaCheckProcessor', () => {
  let tx: any;
  let prisma: any;
  let publisher: any;
  let processor: SlaCheckProcessor;
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'conversation' }]),
      conversation: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          status: ConversationStatus.WAITING_CUSTOMER,
          ticket: {
            id: 'ticket',
            isOverdue: true,
            slaDueAt: new Date('2020-01-01'),
            slaPausedAt: new Date('2020-01-02'),
          },
        }),
        update: jest.fn(),
      },
      ticket: { update: jest.fn() },
    };
    prisma = {
      conversation: {
        findMany: jest.fn().mockResolvedValue([{ id: 'conversation' }]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    publisher = {
      publish: jest.fn().mockResolvedValue(undefined),
      conversationRoom: (id: string) => `conversation:${id}`,
      teamInboxRoom: () => 'team:inbox',
    };
    processor = new SlaCheckProcessor(prisma, publisher);
  });
  it('clears stale overdue flags after rechecking WAITING under lock', async () => {
    await processor.process({ data: { requestedAt: '2000-01-01' } } as never);
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket' },
      data: { isOverdue: false },
    });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation' },
      data: { version: { increment: 1 } },
    });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ticket.updated' }),
      expect.any(Array),
    );
  });
  it('does not roll back committed changes or retry a mutation when Redis is unavailable', async () => {
    publisher.publish.mockRejectedValue(new Error('Redis unavailable'));
    await expect(
      processor.process({ data: {} } as never),
    ).resolves.toBeUndefined();
    expect(tx.ticket.update).toHaveBeenCalledTimes(1);
  });
  it('uses the processing clock to mark an active ticket overdue', async () => {
    tx.conversation.findUniqueOrThrow.mockResolvedValue({
      status: ConversationStatus.NEW,
      ticket: {
        id: 'ticket',
        slaDueAt: new Date(Date.now() - 1000),
        isOverdue: false,
      },
    });
    await processor.process({ data: { requestedAt: '2000-01-01' } } as never);
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket' },
      data: { isOverdue: true },
    });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sla.overdue' }),
      expect.any(Array),
    );
  });
  it('bounds buffered Redis publication after commit', async () => {
    jest.useFakeTimers();
    try {
      publisher.publish.mockImplementation(() => new Promise(() => {}));
      const work = processor.process({ data: {} } as never);
      await jest.advanceTimersByTimeAsync(2000);
      await expect(work).resolves.toBeUndefined();
      expect(tx.ticket.update).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
