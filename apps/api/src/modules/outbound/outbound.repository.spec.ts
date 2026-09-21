import {
  ChannelType,
  OutboundMessageStatus,
  OutboundProvider,
} from '@prisma/client';
import { OutboundRepository } from './outbound.repository';

describe('OutboundRepository', () => {
  it('creates the outbound message, attachments, and outbox event in one transaction', async () => {
    const tx = {
      outboundMessage: {
        create: jest.fn().mockResolvedValue({
          id: 'outbound-1',
          conversationId: 'conversation-1',
          provider: OutboundProvider.EMAIL,
          status: OutboundMessageStatus.PENDING,
        }),
      },
      attachment: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const outbox = {
      createEvent: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };
    const repository = new OutboundRepository(prisma as never, outbox as never);

    await repository.createSendRequest(
      {
        conversationId: 'conversation-1',
        channelType: ChannelType.EMAIL,
        provider: OutboundProvider.EMAIL,
        recipientExternalId: 'customer@example.com',
        content: 'Hello',
      },
      [
        {
          key: 'uploads/file.pdf',
          url: 'http://storage/uploads/file.pdf',
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 42,
        },
      ],
      'agent-1',
      'request-1',
      'hash-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.outboundMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: OutboundMessageStatus.PENDING,
        idempotencyKey: 'request-1',
        requestHash: 'hash-1',
      }),
    });
    expect(tx.attachment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          messageId: null,
          storageKey: 'pending:outbound-1:uploads/file.pdf',
        }),
      ],
    });
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
  });
});
