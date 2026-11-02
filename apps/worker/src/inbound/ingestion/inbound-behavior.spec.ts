import { InboundIngestionService } from './inbound-ingestion.service';
import { InboundIngestionRepository } from './inbound-ingestion.repository';
import { InboundEventRepository } from './inbound-event.repository';
import type { NormalizedInboundMessage } from '../inbound.types';
import {
  ChannelAccountType,
  ChannelType,
  ConversationStatus,
  InboundEventType,
  MessageContentType,
  MessageDirection,
  MessageSenderType,
  InboundProvider,
  Priority,
} from '@prisma/client';

const receivedAt = new Date('2026-01-01T00:00:00Z');

/** Lifecycle compatibility plus initial SLA deadlines aligned with SRS FR-TICKET-03. */
describe.each(['email', 'facebook'])(
  '%s inbound business compatibility',
  (channel) => {
    beforeEach(() =>
      jest.useFakeTimers().setSystemTime(new Date('2026-01-05T00:00:00Z')),
    );
    afterEach(() => jest.useRealTimers());
    function setup(
      status?: ConversationStatus,
      priority: Priority = Priority.MEDIUM,
    ) {
      const conversation = {
        id: 'conversation',
        status,
        version: 3,
        priority,
        subject: null,
        lastMessageAt: receivedAt,
        ticket: { id: 'existing-ticket', slaDueAt: null, slaPausedAt: null },
      };
      const tx = {
        channelAccount: {
          createMany: jest.fn(),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'account' }),
        },
        customer: {
          createMany: jest.fn(),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'customer' }),
          update: jest.fn().mockResolvedValue({ id: 'customer' }),
        },
        $executeRaw: jest.fn(),
        conversation: {
          findFirst: jest.fn().mockResolvedValue(status ? conversation : null),
          findUniqueOrThrow: jest.fn().mockResolvedValue(conversation),
          create: jest.fn().mockResolvedValue({
            ...conversation,
            status: ConversationStatus.NEW,
            ticket: null,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        message: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'message' }),
        },
        attachment: { createMany: jest.fn() },
        ticket: {
          create: jest.fn().mockResolvedValue({ id: 'ticket' }),
          update: jest.fn(),
        },
        inboundEvent: {
          findFirst: jest.fn().mockResolvedValue({ id: 'event' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
      const service = new InboundIngestionService(
        prisma as never,
        new InboundIngestionRepository(),
        new InboundEventRepository(prisma as never),
      );
      const normalized: NormalizedInboundMessage = {
        channelType:
          channel === 'email'
            ? ChannelType.EMAIL
            : ChannelType.FACEBOOK_MESSAGE,
        account: {
          type:
            channel === 'email'
              ? ChannelAccountType.EMAIL
              : ChannelAccountType.FACEBOOK,
          externalId: 'account',
          displayName: 'Account',
          defaultConfig: {},
        },
        customer: {
          identity: {
            kind: channel === 'email' ? 'email' : 'facebook',
            value: 'customer@example.com',
          },
        },
        externalConversationId: 'thread',
        externalMessageId: 'message',
        content: 'Hello',
        contentType: MessageContentType.TEXT,
        direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CUSTOMER,
        receivedAt,
        attachments: [],
        presentation: {
          subject: 'Help',
          subjectStyle: channel === 'email' ? 'email' : 'facebook',
        },
      };
      const run = () =>
        service.ingest(
          {
            event: {
              id: 'event',
              provider:
                channel === 'email'
                  ? InboundProvider.EMAIL
                  : InboundProvider.FACEBOOK,
              eventType:
                channel === 'email'
                  ? InboundEventType.EMAIL_RECEIVED
                  : InboundEventType.MESSAGE,
              dedupKey: 'key',
              receivedAt,
              rawPayload: {},
            },
            leaseStartedAt: receivedAt,
          },
          normalized,
        );
      return { tx, run };
    }

    it.each([
      [Priority.URGENT, 2],
      [Priority.HIGH, 8],
      [Priority.MEDIUM, 24],
      [Priority.LOW, 72],
    ])('creates initial %s SLA at %s hours', async (priority, hours) => {
      const { tx, run } = setup(undefined, priority);
      await run();
      expect(tx.ticket.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conversation',
          slaDueAt: new Date(receivedAt.getTime() + Number(hours) * 3600000),
          isOverdue: true,
        },
      });
    });

    it('reopens resolved conversations without recreating the ticket', async () => {
      const { tx, run } = setup(ConversationStatus.RESOLVED);
      await run();
      expect(tx.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ConversationStatus.IN_PROGRESS,
            resolvedAt: null,
            version: { increment: 1 },
          }),
        }),
      );
      expect(tx.ticket.create).not.toHaveBeenCalled();
    });

    it('resumes WAITING_CUSTOMER with missing pause metadata without inventing a deadline', async () => {
      const { tx, run } = setup(ConversationStatus.WAITING_CUSTOMER);
      await run();
      expect(tx.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ConversationStatus.IN_PROGRESS,
          }),
        }),
      );
      expect(tx.ticket.create).not.toHaveBeenCalled();
    });
  },
);
