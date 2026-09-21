import { OutboundMessageStatus, OutboundProvider } from '@prisma/client';
import { OutboundMessagesProcessor } from './outbound-messages.processor';
import { PermanentJobError } from '../errors/permanent-job.error';
import { DeliveryOutcomeUnknownError } from '../errors/delivery-outcome-unknown.error';

describe('OutboundMessagesProcessor', () => {
  const baseMessage = {
    id: 'outbound-1',
    conversationId: 'conversation-1',
    provider: OutboundProvider.EMAIL,
    status: OutboundMessageStatus.PENDING,
    content: 'Hello',
    externalMessageId: null,
    sentAt: null,
  };

  function createFixture() {
    const sentAt = new Date('2026-09-21T00:00:00.000Z');
    const tx = {
      outboundMessage: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...baseMessage,
          externalMessageId: 'provider-message-1',
          sentAt,
          createdBy: 'agent-1',
          replyToMessageId: null,
          conversation: {
            status: 'NEW',
            firstResponseAt: null,
          },
        }),
        update: jest.fn().mockResolvedValue({
          ...baseMessage,
          status: OutboundMessageStatus.SENT,
        }),
      },
      attachment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      message: {
        upsert: jest.fn().mockResolvedValue({ id: 'timeline-1' }),
      },
      conversation: { update: jest.fn() },
    };
    const prisma = {
      outboundMessage: {
        findUnique: jest.fn().mockResolvedValue(baseMessage),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...baseMessage,
          status: OutboundMessageStatus.SENDING,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...baseMessage }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const adapter = {
      send: jest.fn().mockResolvedValue({
        externalMessageId: 'provider-message-1',
        sentAt,
      }),
    };
    const adapters = { get: jest.fn().mockReturnValue(adapter) };
    const realtime = {
      publish: jest.fn(),
      conversationRoom: jest.fn((id) => `conversation:${id}`),
    };
    const processor = new OutboundMessagesProcessor(
      prisma as never,
      adapters as never,
      realtime as never,
    );
    const job = {
      data: {
        outboundMessageId: 'outbound-1',
        conversationId: 'conversation-1',
        provider: 'EMAIL',
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    return { processor, prisma, tx, adapter, realtime, job };
  }

  it('atomically claims, sends, checkpoints, and finalizes an outbound message', async () => {
    const { processor, prisma, tx, adapter, job } = createFixture();

    await processor.process(job as never);

    expect(prisma.outboundMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [OutboundMessageStatus.PENDING, OutboundMessageStatus.RETRYING],
          },
        }),
      }),
    );
    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(prisma.outboundMessage.update).toHaveBeenCalledWith({
      where: { id: 'outbound-1' },
      data: {
        externalMessageId: 'provider-message-1',
        sentAt: expect.any(Date),
        lastError: null,
      },
    });
    expect(tx.message.upsert).toHaveBeenCalledTimes(1);
    expect(tx.outboundMessage.update).toHaveBeenCalledWith({
      where: { id: 'outbound-1' },
      data: {
        status: OutboundMessageStatus.SENT,
        processingStartedAt: null,
        lastError: null,
      },
    });
  });

  it('does not send when another worker already claimed the message', async () => {
    const { processor, prisma, adapter, job } = createFixture();
    prisma.outboundMessage.updateMany.mockResolvedValue({ count: 0 });

    await processor.process(job as never);

    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('finalizes a persisted provider acknowledgement without sending again', async () => {
    const { processor, prisma, adapter, tx, job } = createFixture();
    prisma.outboundMessage.findUnique.mockResolvedValue({
      ...baseMessage,
      status: OutboundMessageStatus.SENDING,
      externalMessageId: 'provider-message-1',
      sentAt: new Date('2026-09-21T00:00:00.000Z'),
    });

    await processor.process(job as never);

    expect(adapter.send).not.toHaveBeenCalled();
    expect(tx.message.upsert).toHaveBeenCalledTimes(1);
  });

  it('quarantines delivery when provider succeeds but acknowledgement persistence fails', async () => {
    const { processor, prisma, job } = createFixture();
    prisma.outboundMessage.update
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(baseMessage);

    await expect(processor.process(job as never)).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    expect(prisma.outboundMessage.update).toHaveBeenLastCalledWith({
      where: { id: 'outbound-1' },
      data: expect.objectContaining({
        status: OutboundMessageStatus.DELIVERY_UNKNOWN,
        processingStartedAt: null,
      }),
    });
  });

  it('does not retry automatically when the provider outcome is ambiguous', async () => {
    const { processor, prisma, adapter, job } = createFixture();
    adapter.send.mockRejectedValue(
      new DeliveryOutcomeUnknownError('network response was lost'),
    );
    prisma.outboundMessage.update.mockResolvedValue({
      ...baseMessage,
      status: OutboundMessageStatus.DELIVERY_UNKNOWN,
    });

    await expect(processor.process(job as never)).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    expect(prisma.outboundMessage.update).toHaveBeenCalledWith({
      where: { id: 'outbound-1' },
      data: expect.objectContaining({
        status: OutboundMessageStatus.DELIVERY_UNKNOWN,
        processingStartedAt: null,
      }),
    });
  });
});
