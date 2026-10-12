import {
  InboundEventStatus,
  InboundEventType,
  InboundProvider,
  Prisma,
} from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { providerConfig } from '../config/provider.config';
import { EmailLiveInboundService } from './email-live-inbound.service';

jest.mock('imapflow', () => ({
  ImapFlow: jest.fn(),
}));

jest.mock('mailparser', () => ({
  simpleParser: jest.fn(),
}));

describe('EmailLiveInboundService', () => {
  const originalInboundMode = providerConfig.email.inboundMode;
  const originalImapConfig = { ...providerConfig.email.imap };
  const originalSyncMaxMessages = providerConfig.email.syncMaxMessages;
  const originalSyncSinceMinutes = providerConfig.email.syncSinceMinutes;

  afterEach(() => {
    jest.clearAllMocks();
    Object.assign(providerConfig.email, {
      inboundMode: originalInboundMode,
      syncMaxMessages: originalSyncMaxMessages,
      syncSinceMinutes: originalSyncSinceMinutes,
    });
    Object.assign(providerConfig.email.imap, originalImapConfig);
  });

  it('persists IMAP inbound events and their outbox handoff atomically', async () => {
    Object.assign(providerConfig.email, {
      inboundMode: 'live',
      syncMaxMessages: 10,
      syncSinceMinutes: 60,
    });
    Object.assign(providerConfig.email.imap, {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      user: 'support@example.com',
      password: 'app-password',
    });

    const lock = { release: jest.fn() };
    const search = jest.fn().mockResolvedValue([42]);
    const fetch = jest.fn().mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield {
          uid: 42,
          source: Buffer.from('raw-email'),
        };
      })(),
    );
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      getMailboxLock: jest.fn().mockResolvedValue(lock),
      search,
      fetch,
      logout: jest.fn().mockResolvedValue(undefined),
    };
    jest.mocked(ImapFlow).mockImplementation(() => client as never);
    jest.mocked(simpleParser).mockResolvedValue({
      messageId: '<message-1@example.com>',
      from: {
        value: [{ address: 'customer@example.com', name: 'Customer' }],
      },
      to: {
        value: [{ address: 'support@example.com', name: 'Support' }],
      },
      subject: 'Need help',
      text: 'Hello',
      html: '<p>Hello</p>',
      date: new Date('2026-01-01T00:00:00.000Z'),
      references: ['<thread-1@example.com>'],
    } as never);

    const tx = {
      inboundEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'event-1',
          provider: InboundProvider.EMAIL,
          eventType: InboundEventType.EMAIL_RECEIVED,
          dedupKey: 'EMAIL:support@example.com:message-1@example.com',
        }),
      },
      outboxEvent: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      $executeRaw: jest.fn(),
    };
    const prisma = {
      channelAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'channel-1',
          externalId: 'support@example.com',
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new EmailLiveInboundService(prisma as never);

    await expect(
      service.sync({ channelAccountId: 'channel-1' }),
    ).resolves.toEqual({
      fetchedCount: 1,
      processedCount: 1,
    });

    expect(ImapFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'imap.example.com',
        auth: {
          user: 'support@example.com',
          pass: 'app-password',
        },
      }),
    );
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ seen: false }),
    );
    expect(fetch).toHaveBeenCalledWith(42, {
      envelope: true,
      source: true,
      uid: true,
    });
    expect(tx.inboundEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: InboundProvider.EMAIL,
        eventType: InboundEventType.EMAIL_RECEIVED,
        externalEventId: 'message-1@example.com',
        dedupKey: 'EMAIL:support@example.com:message-1@example.com',
        rawPayload: expect.objectContaining({
          fromEmail: 'customer@example.com',
          subject: 'Need help',
          contentType: 'HTML',
          threadId: 'thread-1@example.com',
          references: ['thread-1@example.com'],
        }),
      }),
      select: {
        id: true,
        provider: true,
        eventType: true,
        dedupKey: true,
      },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'INBOUND_EVENT_CREATED',
        aggregateId: 'event-1',
        payload: {
          inboundEventId: 'event-1',
          dedupKey: 'EMAIL:support@example.com:message-1@example.com',
          provider: InboundProvider.EMAIL,
          eventType: InboundEventType.EMAIL_RECEIVED,
        },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(lock.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it('repairs a legacy pending IMAP event that has no outbox record', async () => {
    Object.assign(providerConfig.email, {
      inboundMode: 'live',
      syncMaxMessages: 10,
      syncSinceMinutes: 60,
    });
    Object.assign(providerConfig.email.imap, {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      user: 'support@example.com',
      password: 'app-password',
    });

    const lock = { release: jest.fn() };
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      getMailboxLock: jest.fn().mockResolvedValue(lock),
      search: jest.fn().mockResolvedValue([42]),
      fetch: jest.fn().mockReturnValue(
        (async function* () {
          await Promise.resolve();
          yield { uid: 42, source: Buffer.from('raw-email') };
        })(),
      ),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    jest.mocked(ImapFlow).mockImplementation(() => client as never);
    jest.mocked(simpleParser).mockResolvedValue({
      messageId: '<message-1@example.com>',
      from: { value: [{ address: 'customer@example.com' }] },
      text: 'Hello',
    } as never);

    const existingEvent = {
      id: 'event-1',
      provider: InboundProvider.EMAIL,
      eventType: InboundEventType.EMAIL_RECEIVED,
      dedupKey: 'EMAIL:support@example.com:message-1@example.com',
      normalizedStatus: InboundEventStatus.PENDING,
    };
    const tx = {
      inboundEvent: {
        findUnique: jest.fn().mockResolvedValue(existingEvent),
        create: jest.fn(),
      },
      outboxEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      channelAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'channel-1',
          externalId: 'support@example.com',
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new EmailLiveInboundService(prisma as never);

    await expect(
      service.sync({ channelAccountId: 'channel-1' }),
    ).resolves.toEqual({ fetchedCount: 1, processedCount: 1 });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.inboundEvent.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'INBOUND_EVENT_CREATED',
        aggregateId: 'event-1',
      }),
    });
  });

  it('does not enqueue a duplicate when the inbound event already has an outbox record', async () => {
    Object.assign(providerConfig.email, {
      inboundMode: 'live',
      syncMaxMessages: 10,
      syncSinceMinutes: 60,
    });
    Object.assign(providerConfig.email.imap, {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      user: 'support@example.com',
      password: 'app-password',
    });

    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
      search: jest.fn().mockResolvedValue([42]),
      fetch: jest.fn().mockReturnValue(
        (async function* () {
          await Promise.resolve();
          yield { uid: 42, source: Buffer.from('raw-email') };
        })(),
      ),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    jest.mocked(ImapFlow).mockImplementation(() => client as never);
    jest.mocked(simpleParser).mockResolvedValue({
      messageId: '<message-1@example.com>',
      from: { value: [{ address: 'customer@example.com' }] },
      text: 'Hello',
    } as never);

    const tx = {
      inboundEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event-1',
          provider: InboundProvider.EMAIL,
          eventType: InboundEventType.EMAIL_RECEIVED,
          dedupKey: 'EMAIL:support@example.com:message-1@example.com',
          normalizedStatus: InboundEventStatus.PENDING,
        }),
        create: jest.fn(),
      },
      outboxEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
        create: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      channelAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'channel-1',
          externalId: 'support@example.com',
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new EmailLiveInboundService(prisma as never);

    await expect(
      service.sync({ channelAccountId: 'channel-1' }),
    ).resolves.toEqual({ fetchedCount: 1, processedCount: 0 });

    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('recovers a concurrent dedup-key insert without creating a duplicate outbox event', async () => {
    const dedupKey = 'EMAIL:support@example.com:message-1@example.com';
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['dedup_key'] },
      },
    );
    const createTx = {
      inboundEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(uniqueViolation),
      },
      outboxEvent: { create: jest.fn() },
    };
    const recoveryTx = {
      inboundEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event-1',
          provider: InboundProvider.EMAIL,
          eventType: InboundEventType.EMAIL_RECEIVED,
          dedupKey,
          normalizedStatus: InboundEventStatus.PENDING,
        }),
      },
      outboxEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
        create: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((callback) => callback(createTx))
        .mockImplementationOnce((callback) => callback(recoveryTx)),
    };
    const service = new EmailLiveInboundService(prisma as never);
    const persistInboundEvent = (
      service as unknown as {
        persistInboundEvent: (
          payload: { mailbox: string; messageId: string; fromEmail: string },
          key: string,
        ) => Promise<boolean>;
      }
    ).persistInboundEvent.bind(service);

    await expect(
      persistInboundEvent(
        {
          mailbox: 'support@example.com',
          messageId: 'message-1@example.com',
          fromEmail: 'customer@example.com',
        },
        dedupKey,
      ),
    ).resolves.toBe(false);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(recoveryTx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
