import { OutboundMessageStatus, OutboundProvider } from '@prisma/client';
import { ReconcileScheduler } from './reconcile.scheduler';

describe('ReconcileScheduler outbound recovery', () => {
  it('quarantines ambiguous sends and re-enqueues recoverable messages through outbox', async () => {
    const tx = {
      outboxEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      outboundMessage: { update: jest.fn() },
    };
    const prisma = {
      inboundEvent: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      outboundMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbound-1',
            conversationId: 'conversation-1',
            provider: OutboundProvider.EMAIL,
          },
        ]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const outbox = { createEvent: jest.fn() };
    const dispatcher = { trigger: jest.fn() };
    const scheduler = new ReconcileScheduler(
      prisma as never,
      outbox as never,
      dispatcher as never,
    );

    await scheduler.reconcile();

    expect(prisma.outboundMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OutboundMessageStatus.DELIVERY_UNKNOWN,
        }),
      }),
    );
    expect(outbox.createEvent).toHaveBeenCalledWith(
      tx,
      'OUTBOUND_MESSAGE_SEND_REQUESTED',
      'outbound-1',
      {
        outboundMessageId: 'outbound-1',
        conversationId: 'conversation-1',
        provider: OutboundProvider.EMAIL,
      },
    );
    expect(dispatcher.trigger).toHaveBeenCalledTimes(1);
  });

  it('does not create another recovery event while one is pending', async () => {
    const tx = {
      outboxEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pending-outbox' }),
      },
      outboundMessage: { update: jest.fn() },
    };
    const prisma = {
      inboundEvent: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      outboundMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbound-1',
            conversationId: 'conversation-1',
            provider: OutboundProvider.EMAIL,
          },
        ]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const outbox = { createEvent: jest.fn() };
    const dispatcher = { trigger: jest.fn() };
    const scheduler = new ReconcileScheduler(
      prisma as never,
      outbox as never,
      dispatcher as never,
    );

    await scheduler.reconcile();

    expect(outbox.createEvent).not.toHaveBeenCalled();
    expect(dispatcher.trigger).not.toHaveBeenCalled();
  });
});
