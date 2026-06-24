import { Injectable } from '@nestjs/common';
import { InboundEventType, InboundProvider } from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import { MockInboundEmailPayload } from '@omnidesk/shared';
import { providerConfig } from '../config/provider.config';
import { PrismaService } from '../database/prisma.service';
import { EmailInboundService } from './email-inbound.service';

type SyncLiveInboundParams = {
  channelAccountId: string;
};

type SyncLiveInboundResult = {
  fetchedCount: number;
  processedCount: number;
};

@Injectable()
export class EmailLiveInboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailInboundService: EmailInboundService,
  ) {}

  async sync(params: SyncLiveInboundParams): Promise<SyncLiveInboundResult> {
    if (providerConfig.email.inboundMode !== 'live') {
      return { fetchedCount: 0, processedCount: 0 };
    }

    const channelAccount = await this.prisma.channelAccount.findUnique({
      where: { id: params.channelAccountId },
    });

    if (!channelAccount) {
      throw new Error('Email channel account not found');
    }

    const client = new ImapFlow({
      host: requireConfig(providerConfig.email.imap.host, 'EMAIL_IMAP_HOST'),
      port: providerConfig.email.imap.port,
      secure: providerConfig.email.imap.secure,
      auth: {
        user: requireConfig(providerConfig.email.imap.user, 'EMAIL_IMAP_USER'),
        pass: requireConfig(
          providerConfig.email.imap.password,
          'EMAIL_IMAP_PASSWORD',
        ),
      },
    });

    let fetchedCount = 0;
    let processedCount = 0;
    const since = getSyncSinceDate(providerConfig.email.syncSinceMinutes);
    const maxMessages = providerConfig.email.syncMaxMessages;

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      for await (const message of client.fetch(
        { seen: false, since, gmraw: 'category:primary' },
        { envelope: true, source: true, uid: true },
      )) {
        if (fetchedCount >= maxMessages) {
          break;
        }

        fetchedCount += 1;

        if (!message.source) {
          continue;
        }

        const parsed = await simpleParser(message.source);
        const from = firstAddress(parsed.from);
        const to = firstAddress(parsed.to);
        const messageId = normalizeMessageId(
          parsed.messageId ?? `imap-${message.uid}`,
        );

        if (!from?.address) {
          continue;
        }

        const rawPayload: MockInboundEmailPayload = {
          mailbox: channelAccount.externalId,
          messageId,
          fromEmail: from.address,
          fromName: from.name,
          toEmail: to?.address,
          subject: parsed.subject ?? '(no subject)',
          text: parsed.text,
          html: typeof parsed.html === 'string' ? parsed.html : undefined,
          contentType: parsed.html ? 'HTML' : 'TEXT',
          receivedAt: (parsed.date ?? new Date()).toISOString(),
          threadId: getThreadId(parsed.references, parsed.inReplyTo, messageId),
          inReplyTo: parsed.inReplyTo,
          channelAccountId: channelAccount.id,
        };
        const dedupKey = buildDedupKey(rawPayload.mailbox, messageId);

        const existing = await this.prisma.inboundEvent.findUnique({
          where: { dedupKey },
        });

        if (existing) {
          continue;
        }

        const inboundEvent = await this.prisma.inboundEvent.create({
          data: {
            provider: InboundProvider.EMAIL,
            eventType: InboundEventType.EMAIL_RECEIVED,
            externalEventId: messageId,
            dedupKey,
            rawPayload,
          },
        });

        await this.emailInboundService.process(inboundEvent);
        processedCount += 1;
      }
    } finally {
      lock.release();
      await client.logout();
    }

    return { fetchedCount, processedCount };
  }
}

function requireConfig(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function firstAddress(addresses: AddressObject | AddressObject[] | undefined) {
  const addressObject = Array.isArray(addresses) ? addresses[0] : addresses;
  return addressObject?.value[0];
}

function normalizeMessageId(messageId: string) {
  return messageId.trim().replace(/^<|>$/g, '');
}

function buildDedupKey(mailbox: string, messageId: string) {
  return `EMAIL:${mailbox.trim().toLowerCase()}:${messageId.trim()}`;
}

function getThreadId(
  references: string[] | string | undefined,
  inReplyTo: string | undefined,
  messageId: string,
) {
  if (Array.isArray(references) && references.length > 0) {
    return normalizeMessageId(references[0]);
  }

  if (typeof references === 'string' && references.trim().length > 0) {
    return normalizeMessageId(references.split(/\s+/)[0]);
  }

  return inReplyTo ? normalizeMessageId(inReplyTo) : messageId;
}

function getSyncSinceDate(syncSinceMinutes: number) {
  const now = Date.now();
  const minutes = Math.max(syncSinceMinutes, 1);

  return new Date(now - minutes * 60 * 1000);
}
