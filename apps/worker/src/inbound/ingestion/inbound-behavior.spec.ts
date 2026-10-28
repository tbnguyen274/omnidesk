import { InboundIngestionService } from './inbound-ingestion.service';
import { InboundIngestionRepository } from './inbound-ingestion.repository';
import { InboundEventRepository } from './inbound-event.repository';
import type { NormalizedInboundMessage } from '../inbound.types';

const receivedAt = new Date('2026-01-01T00:00:00Z');

/** Lifecycle compatibility plus initial SLA deadlines aligned with SRS FR-TICKET-03. */
describe.each(['email', 'facebook'])(
  '%s inbound business compatibility',
  (channel) => {
    function setup(status?: string, priority = 'MEDIUM') {
      const conversation = {
        id: 'conversation',
        status,
        version: 3,
        priority,
        subject: null,
        ticket: { id: 'existing-ticket' },
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
          create: jest.fn().mockResolvedValue({
            ...conversation,
            status: 'NEW',
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
        ticket: { create: jest.fn().mockResolvedValue({ id: 'ticket' }) },
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
        channelType: channel === 'email' ? 'EMAIL' : 'FACEBOOK_MESSAGE',
        account: {
          type: channel === 'email' ? 'EMAIL' : 'FACEBOOK',
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
        contentType: 'TEXT',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
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
              provider: channel === 'email' ? 'EMAIL' : 'FACEBOOK',
              eventType: channel === 'email' ? 'EMAIL_RECEIVED' : 'MESSAGE',
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
      ['URGENT', 2],
      ['HIGH', 8],
      ['MEDIUM', 24],
      ['LOW', 72],
    ])('creates initial %s SLA at %s hours', async (priority, hours) => {
      const { tx, run } = setup(undefined, priority);
      await run();
      expect(tx.ticket.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conversation',
          slaDueAt: new Date(receivedAt.getTime() + Number(hours) * 3600000),
        },
      });
    });

    it('reopens resolved conversations without recreating the ticket', async () => {
      const { tx, run } = setup('RESOLVED');
      await run();
      expect(tx.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'IN_PROGRESS',
            resolvedAt: null,
            version: { increment: 1 },
          }),
        }),
      );
      expect(tx.ticket.create).not.toHaveBeenCalled();
    });

    it('preserves WAITING_CUSTOMER behavior for the separate lifecycle backlog', async () => {
      const { tx, run } = setup('WAITING_CUSTOMER');
      await run();
      expect(tx.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: undefined,
            resolvedAt: undefined,
          }),
        }),
      );
      expect(tx.ticket.create).not.toHaveBeenCalled();
    });
  },
);
