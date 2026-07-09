import { InboundEventType, InboundProvider } from '@prisma/client';
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

  it('polls unseen IMAP messages, parses email payload, and processes inbound events', async () => {
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

    const inboundEvent = { id: 'event-1' };
    const prisma = {
      channelAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'channel-1',
          externalId: 'support@example.com',
        }),
      },
      inboundEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(inboundEvent),
      },
    };
    const emailInboundService = {
      process: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EmailLiveInboundService(
      prisma as never,
      emailInboundService as never,
    );

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
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ seen: false }),
      { envelope: true, source: true, uid: true },
    );
    expect(prisma.inboundEvent.create).toHaveBeenCalledWith({
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
    });
    expect(emailInboundService.process).toHaveBeenCalledWith(inboundEvent);
    expect(lock.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });
});
