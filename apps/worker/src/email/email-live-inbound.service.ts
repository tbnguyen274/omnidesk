import { Injectable } from '@nestjs/common';
import { InboundEventType, InboundProvider } from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import { InboundEmailAttachment, InboundEmailPayload } from '@omnidesk/shared';
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
      // 1. Search unread emails
      let uids: number[] = [];
      try {
        const found = await client.search({
          seen: false,
          since,
          gmraw: 'category:primary',
        });
        if (Array.isArray(found)) {
          uids = found;
        }
      } catch {
        // Fallback without gmraw for non-Gmail IMAP servers
        const found = await client.search({ seen: false, since });
        if (Array.isArray(found)) {
          uids = found;
        }
      }

      // Sort newest first
      const newestUids = [...uids].reverse();

      for (const uid of newestUids) {
        if (processedCount >= maxMessages) {
          break;
        }

        fetchedCount += 1;

        let source: Buffer | undefined;
        let envelopeMessageId: string | undefined;
        for await (const message of client.fetch(uid, {
          envelope: true,
          source: true,
          uid: true,
        })) {
          source = message.source;
          envelopeMessageId = message.envelope?.messageId;
        }

        if (!source) {
          continue;
        }

        const parsed = await simpleParser(source);
        const from = firstAddress(parsed.from);
        const to = firstAddress(parsed.to);
        const messageId = normalizeMessageId(
          parsed.messageId ?? envelopeMessageId ?? `imap-${uid}`,
        );

        if (!from?.address) {
          continue;
        }

        const attachments: InboundEmailAttachment[] = [];
        if (parsed.attachments && parsed.attachments.length > 0) {
          let idx = 0;
          for (const att of parsed.attachments) {
            const fileName = att.filename || `attachment-${idx + 1}`;
            const mimeType = att.contentType || 'application/octet-stream';
            const sizeBytes = att.size || att.content?.length || 0;
            const key = `lazy:imap:${channelAccount.id}:${messageId}:${idx}:${encodeURIComponent(fileName)}`;

            attachments.push({
              key,
              url: '', // Will be assigned to proxy URL when Attachment row is created
              fileName,
              mimeType,
              sizeBytes,
            });
            idx++;
          }
        }

        const rawPayload: InboundEmailPayload = {
          mailbox: channelAccount.externalId,
          messageId,
          fromEmail: from.address,
          fromName: from.name,
          toEmail: to?.address,
          subject: parsed.subject ?? '(no subject)',
          text: parsed.text,
          html: typeof parsed.html === 'string' ? parsed.html : undefined,
          contentType:
            attachments.length > 0
              ? 'ATTACHMENT'
              : parsed.html
                ? 'HTML'
                : 'TEXT',
          receivedAt: (parsed.date ?? new Date()).toISOString(),
          threadId: getThreadId(parsed.references, parsed.inReplyTo, messageId),
          inReplyTo: parsed.inReplyTo,
          references: normalizeReferences(parsed.references),
          channelAccountId: channelAccount.id,
          attachments: attachments.length > 0 ? attachments : undefined,
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

function normalizeReferences(references: string[] | string | undefined) {
  if (Array.isArray(references)) {
    return references.map(normalizeMessageId).filter(Boolean);
  }

  if (typeof references === 'string' && references.trim().length > 0) {
    return references.split(/\s+/).map(normalizeMessageId).filter(Boolean);
  }

  return undefined;
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
