import { Injectable } from '@nestjs/common';
import {
  InboundEventStatus,
  InboundEventType,
  InboundProvider,
  Prisma,
} from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import { InboundEmailAttachment, InboundEmailPayload } from '@omnidesk/shared';
import { providerConfig } from '../config/provider.config';
import { PrismaService } from '../database/prisma.service';

type SyncLiveInboundParams = {
  channelAccountId: string;
};

type SyncLiveInboundResult = {
  fetchedCount: number;
  // Number of messages durably accepted for asynchronous inbound processing.
  processedCount: number;
};

@Injectable()
export class EmailLiveInboundService {
  constructor(private readonly prisma: PrismaService) {}

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

        const scheduled = await this.persistInboundEvent(rawPayload, dedupKey);
        if (scheduled) processedCount += 1;
      }
    } finally {
      lock.release();
      await client.logout();
    }

    return { fetchedCount, processedCount };
  }

  /**
   * Persists the provider event and its queue handoff atomically. The API
   * outbox dispatcher will enqueue INBOUND_EVENT_CREATED with a deterministic
   * BullMQ job ID, so IMAP polling never has to invoke the domain processor
   * directly or perform a database/Redis dual write.
   */
  private async persistInboundEvent(
    rawPayload: InboundEmailPayload,
    dedupKey: string,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.inboundEvent.findUnique({
          where: { dedupKey },
          select: {
            id: true,
            provider: true,
            eventType: true,
            dedupKey: true,
            normalizedStatus: true,
          },
        });

        if (existing) {
          return this.ensurePendingEventHasOutbox(tx, existing);
        }

        const inboundEvent = await tx.inboundEvent.create({
          data: {
            provider: InboundProvider.EMAIL,
            eventType: InboundEventType.EMAIL_RECEIVED,
            externalEventId: rawPayload.messageId,
            dedupKey,
            rawPayload,
          },
          select: {
            id: true,
            provider: true,
            eventType: true,
            dedupKey: true,
          },
        });

        await this.createInboundOutboxEvent(tx, inboundEvent);
        return true;
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) throw error;

      // A concurrent poll may have inserted the same dedupKey after our read.
      // Re-enter through the existing-event path so a legacy PENDING event is
      // repaired if it was created before IMAP adopted the outbox protocol.
      return this.prisma.$transaction(async (tx) => {
        const existing = await tx.inboundEvent.findUnique({
          where: { dedupKey },
          select: {
            id: true,
            provider: true,
            eventType: true,
            dedupKey: true,
            normalizedStatus: true,
          },
        });

        return existing
          ? this.ensurePendingEventHasOutbox(tx, existing)
          : false;
      });
    }
  }

  private async ensurePendingEventHasOutbox(
    tx: Prisma.TransactionClient,
    event: {
      id: string;
      provider: InboundProvider;
      eventType: InboundEventType;
      dedupKey: string;
      normalizedStatus: InboundEventStatus;
    },
  ) {
    if (event.normalizedStatus !== InboundEventStatus.PENDING) return false;

    // Serialize recovery for the same legacy event so concurrent IMAP syncs do
    // not create more than one replacement outbox record.
    await tx.$executeRaw`SELECT 1 FROM "inbound_events" WHERE "id" = ${event.id}::uuid FOR UPDATE`;

    // READ COMMITTED can observe a newer row version after waiting for the
    // lock. Avoid recreating a handoff for an event processed in the meantime.
    const currentEvent = await tx.inboundEvent.findUnique({
      where: { id: event.id },
      select: { normalizedStatus: true },
    });
    if (currentEvent?.normalizedStatus !== InboundEventStatus.PENDING) {
      return false;
    }

    const existingOutbox = await tx.outboxEvent.findFirst({
      where: {
        type: 'INBOUND_EVENT_CREATED',
        aggregateId: event.id,
      },
      select: { id: true },
    });
    if (existingOutbox) return false;

    await this.createInboundOutboxEvent(tx, event);
    return true;
  }

  private createInboundOutboxEvent(
    tx: Prisma.TransactionClient,
    event: {
      id: string;
      provider: InboundProvider;
      eventType: InboundEventType;
      dedupKey: string;
    },
  ) {
    return tx.outboxEvent.create({
      data: {
        type: 'INBOUND_EVENT_CREATED',
        aggregateId: event.id,
        payload: {
          inboundEventId: event.id,
          dedupKey: event.dedupKey,
          provider: event.provider,
          eventType: event.eventType,
        },
      },
    });
  }

  private isUniqueConstraintViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
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
