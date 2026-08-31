import { OutboxService } from './outbox.service';
import { OutboxEventStatus } from '@prisma/client';

describe('OutboxService', () => {
  let service: OutboxService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      outboxEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    service = new OutboxService(prisma);
  });

  describe('createEvent', () => {
    it('creates an event in PENDING status using the provided transaction client', async () => {
      const tx = {
        outboxEvent: {
          create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
        },
      };

      const payload = { conversationId: 'c-1', version: 1 };
      const result = await service.createEvent(
        tx as any,
        'CONVERSATION_STATUS_CHANGED',
        'c-1',
        payload,
      );

      expect(result).toEqual({ id: 'outbox-1' });
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'CONVERSATION_STATUS_CHANGED',
          aggregateId: 'c-1',
          payload,
          status: OutboxEventStatus.PENDING,
        },
      });
    });
  });

  describe('findPending', () => {
    it('queries events with PENDING status ordered by createdAt asc with limit', async () => {
      prisma.outboxEvent.findMany.mockResolvedValueOnce([{ id: 'evt-1' }]);

      const result = await service.findPending(50);

      expect(result).toEqual([{ id: 'evt-1' }]);
      expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
        where: { status: OutboxEventStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
    });
  });

  describe('markPublished', () => {
    it('updates status to PUBLISHED with jobId and publishedAt', async () => {
      prisma.outboxEvent.update.mockResolvedValueOnce({ id: 'evt-1' });

      await service.markPublished('evt-1', 'job-100');

      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: OutboxEventStatus.PUBLISHED,
          jobId: 'job-100',
          publishedAt: expect.any(Date),
        },
      });
    });
  });

  describe('markFailed', () => {
    it('updates status to DEAD with errorMessage and increments attempts', async () => {
      prisma.outboxEvent.update.mockResolvedValueOnce({ id: 'evt-1' });

      await service.markFailed('evt-1', 'Redis connection timeout');

      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: OutboxEventStatus.DEAD,
          errorMessage: 'Redis connection timeout',
          failedAt: expect.any(Date),
          attempts: { increment: 1 },
        },
      });
    });
  });

  describe('incrementAttempts', () => {
    it('increments attempts counter and updates errorMessage', async () => {
      prisma.outboxEvent.update.mockResolvedValueOnce({ id: 'evt-1' });

      await service.incrementAttempts('evt-1', 'Temporary failure');

      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          attempts: { increment: 1 },
          errorMessage: 'Temporary failure',
        },
      });
    });
  });

  describe('cleanup', () => {
    it('deletes published events older than retention cutoff', async () => {
      prisma.outboxEvent.deleteMany.mockResolvedValueOnce({ count: 5 });

      const result = await service.cleanup(7);

      expect(result).toEqual({ count: 5 });
      expect(prisma.outboxEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          status: OutboxEventStatus.PUBLISHED,
          publishedAt: { lt: expect.any(Date) },
        },
      });
    });
  });

  describe('replayDeadEvents', () => {
    it('replays dead events by resetting status to PENDING, attempts to 0 and clearing error message', async () => {
      prisma.outboxEvent.updateMany.mockResolvedValueOnce({ count: 3 });

      const result = await service.replayDeadEvents(24);

      expect(result).toEqual({ count: 3 });
      expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          status: OutboxEventStatus.DEAD,
          createdAt: { gte: expect.any(Date) },
        },
        data: {
          status: OutboxEventStatus.PENDING,
          attempts: 0,
          errorMessage: null,
        },
      });
    });
  });
});
