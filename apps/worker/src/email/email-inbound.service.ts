import { Injectable, Logger } from '@nestjs/common';
import {
  InboundEmailPayload,
  InboundEmailPayloadSchema,
  NormalizedEmailMessage,
  REALTIME_EVENT_TYPES,
  calculateSlaDueAt,
} from '@omnidesk/shared';
import {
  ChannelAccountType,
  ChannelType,
  ConversationStatus,
  InboundEvent,
  InboundEventStatus,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  MessageSenderType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';

@Injectable()
export class EmailInboundService {
  private readonly logger = new Logger(EmailInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async process(inboundEvent: InboundEvent) {
    const parsed = InboundEmailPayloadSchema.safeParse(inboundEvent.rawPayload);
    if (!parsed.success) {
      this.logger.error(
        `Permanent schema mismatch for inbound event ${inboundEvent.id}: ${parsed.error.message}`,
      );
      await this.prisma.inboundEvent.update({
        where: { id: inboundEvent.id },
        data: {
          normalizedStatus: InboundEventStatus.FAILED,
          errorMessage: parsed.error.message,
        },
      });
      return;
    }

    const normalized = this.normalizePayload(
      parsed.data,
      inboundEvent.dedupKey,
      inboundEvent.rawPayload,
    );
    const receivedAt = new Date(normalized.message.receivedAt);

    const publishPlan = await this.prisma.$transaction(async (tx) => {
      let conversationCreated = false;
      let messageId: string | null = null;
      let ticketId: string | null = null;

      const channelAccount = await this.findOrCreateChannelAccount(
        tx,
        normalized,
      );
      const customer = await this.findOrCreateCustomer(tx, normalized);

      // Acquire a row-level lock on the customer to prevent race conditions
      // for concurrent webhooks of the same customer.
      await tx.$executeRaw`SELECT 1 FROM "customers" WHERE "id" = ${customer.id}::uuid FOR UPDATE`;

      let conversation = await tx.conversation.findFirst({
        where: {
          channelType: ChannelType.EMAIL,
          channelAccountId: channelAccount.id,
          externalConversationId: normalized.externalConversationId,
        },
        include: {
          ticket: {
            select: { id: true },
          },
        },
      });

      // If the latest conversation is CLOSED, ignore it and force a new one
      if (conversation && conversation.status === ConversationStatus.CLOSED) {
        conversation = null;
      }

      if (!conversation) {
        conversationCreated = true;
        conversation = await tx.conversation.create({
          data: {
            channelType: ChannelType.EMAIL,
            channelAccountId: channelAccount.id,
            customerId: customer.id,
            externalConversationId: normalized.externalConversationId,
            subject: normalized.message.subject,
            status: ConversationStatus.NEW,
            lastMessageAt: receivedAt,
          },
          include: {
            ticket: {
              select: { id: true },
            },
          },
        });
      } else {
        const isResolved = conversation.status === ConversationStatus.RESOLVED;
        const result = await tx.conversation.updateMany({
          where: { id: conversation.id, version: conversation.version },
          data: {
            customerId: customer.id,
            subject: conversation.subject ?? normalized.message.subject,
            lastMessageAt: receivedAt,
            status: isResolved ? ConversationStatus.IN_PROGRESS : undefined,
            resolvedAt: isResolved ? null : undefined,
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          throw new Error(
            'OCC Conflict: Conversation was updated by another process. Worker will retry.',
          );
        }
      }

      const existingMessage = await tx.message.findUnique({
        where: {
          conversationId_externalMessageId: {
            conversationId: conversation.id,
            externalMessageId: normalized.externalMessageId,
          },
        },
      });

      if (!existingMessage) {
        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            inboundEventId: inboundEvent.id,
            direction: MessageDirection.INBOUND,
            senderType: MessageSenderType.CUSTOMER,
            content: normalized.message.content,
            contentType: normalized.message.contentType,
            externalMessageId: normalized.externalMessageId,
            rawPayload: normalized.rawPayload,
            deliveryStatus: MessageDeliveryStatus.RECEIVED,
            createdAt: receivedAt,
          },
        });
        messageId = message.id;

        if (
          normalized.message.attachments &&
          normalized.message.attachments.length > 0
        ) {
          await tx.attachment.createMany({
            data: normalized.message.attachments.map((att) => {
              const attachmentId = randomUUID();
              return {
                id: attachmentId,
                messageId: message.id,
                storageKey: att.key,
                url: `/api/v1/attachments/${attachmentId}/content`,
                fileName: att.fileName,
                mimeType: att.mimeType,
                sizeBytes: att.sizeBytes,
              };
            }),
          });
        }
      }

      if (!conversation.ticket) {
        const priority = conversation.priority ?? 'MEDIUM';
        const ticket = await tx.ticket.create({
          data: {
            conversationId: conversation.id,
            slaDueAt: calculateSlaDueAt(priority, receivedAt),
          },
        });
        ticketId = ticket.id;
      }

      await tx.inboundEvent.update({
        where: { id: inboundEvent.id },
        data: {
          normalizedStatus: InboundEventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      return {
        conversationId: conversation.id,
        conversationCreated,
        messageId,
        ticketId,
      };
    });

    await this.publishRealtimeEvents(publishPlan);
  }

  private async publishRealtimeEvents(plan: {
    conversationId: string;
    conversationCreated: boolean;
    messageId: string | null;
    ticketId: string | null;
  }) {
    const conversationRoom = this.realtimeEventsPublisher.conversationRoom(
      plan.conversationId,
    );
    const rooms = [
      conversationRoom,
      this.realtimeEventsPublisher.teamInboxRoom(),
    ];
    const occurredAt = new Date().toISOString();

    const publishPromises = [
      this.realtimeEventsPublisher.publish(
        {
          type: plan.conversationCreated
            ? REALTIME_EVENT_TYPES.CONVERSATION_CREATED
            : REALTIME_EVENT_TYPES.CONVERSATION_UPDATED,
          conversationId: plan.conversationId,
          occurredAt,
        },
        rooms,
      ),
    ];

    if (plan.messageId) {
      publishPromises.push(
        this.realtimeEventsPublisher.publish(
          {
            type: REALTIME_EVENT_TYPES.MESSAGE_CREATED,
            conversationId: plan.conversationId,
            messageId: plan.messageId,
            occurredAt,
          },
          rooms,
        ),
      );
    }

    if (plan.ticketId) {
      publishPromises.push(
        this.realtimeEventsPublisher.publish(
          {
            type: REALTIME_EVENT_TYPES.TICKET_UPDATED,
            conversationId: plan.conversationId,
            ticketId: plan.ticketId,
            occurredAt,
          },
          rooms,
        ),
      );
    }

    await Promise.all(publishPromises);
  }

  private normalizePayload(
    payload: InboundEmailPayload,
    dedupKey: string,
    rawPayload: Prisma.JsonValue,
  ): NormalizedEmailMessage {
    const contentType =
      payload.contentType === MessageContentType.HTML || payload.html
        ? MessageContentType.HTML
        : MessageContentType.TEXT;
    const content =
      contentType === MessageContentType.HTML
        ? this.sanitizeHtml(payload.html ?? payload.text ?? '')
        : (payload.text ?? this.stripHtml(payload.html ?? ''));
    const threadKey =
      payload.threadId ??
      payload.inReplyTo ??
      this.normalizeSubject(payload.subject);

    return {
      provider: 'EMAIL',
      channelType: 'EMAIL',
      externalMessageId: payload.messageId,
      externalConversationId: `EMAIL:${payload.mailbox.toLowerCase()}:${threadKey}`,
      customer: {
        name: payload.fromName,
        email: payload.fromEmail.toLowerCase(),
      },
      message: {
        subject: payload.subject,
        content,
        contentType:
          payload.attachments && payload.attachments.length > 0
            ? MessageContentType.ATTACHMENT
            : contentType,
        receivedAt: payload.receivedAt ?? new Date().toISOString(),
        attachments: payload.attachments,
      },
      source: {
        mailbox: payload.mailbox,
        channelAccountId: payload.channelAccountId,
        toEmail: payload.toEmail,
        threadId: payload.threadId,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
      },
      rawPayload: rawPayload as any,
      dedupKey,
    };
  }

  private async findOrCreateChannelAccount(
    tx: Prisma.TransactionClient,
    normalized: NormalizedEmailMessage,
  ) {
    if (normalized.source.channelAccountId) {
      const channelAccount = await tx.channelAccount.findUnique({
        where: { id: normalized.source.channelAccountId },
      });

      if (channelAccount) {
        return channelAccount;
      }
    }

    const channelAccount = await tx.channelAccount.findFirst({
      where: {
        type: ChannelAccountType.EMAIL,
        externalId: normalized.source.mailbox,
      },
    });

    if (channelAccount) {
      return channelAccount;
    }

    return tx.channelAccount.create({
      data: {
        type: ChannelAccountType.EMAIL,
        displayName: `Email - ${normalized.source.mailbox}`,
        externalId: normalized.source.mailbox,
        configJson: {
          mailbox: normalized.source.mailbox,
          mode: 'mock',
        },
      },
    });
  }

  private async findOrCreateCustomer(
    tx: Prisma.TransactionClient,
    normalized: NormalizedEmailMessage,
  ) {
    if (!normalized.customer.email) {
      throw new Error('Customer email is missing for upsert');
    }

    return tx.customer.upsert({
      where: { email: normalized.customer.email },
      update: normalized.customer.name
        ? { name: normalized.customer.name }
        : {},
      create: {
        name: normalized.customer.name,
        email: normalized.customer.email,
      },
    });
  }

  private normalizeSubject(subject: string) {
    return subject
      .trim()
      .replace(/^(re|fw|fwd):\s*/i, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 120);
  }

  /**
   * Sanitizes email HTML content against XSS attacks.
   * Strips executable script blocks, iframes, objects, embeds, forms,
   * inline event handlers (onerror, onload, etc.), and dangerous URI protocols.
   */
  private sanitizeHtml(html: string): string {
    if (!html) return '';

    return (
      html
        // 1. Remove dangerous executable tags and their inner content
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
        .replace(/<object\b[\s\S]*?<\/object>/gi, '')
        .replace(/<embed\b[\s\S]*?<\/embed>/gi, '')
        .replace(/<applet\b[\s\S]*?<\/applet>/gi, '')
        .replace(/<form\b[\s\S]*?<\/form>/gi, '')
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
        // 2. Remove lingering self-closing or unclosed dangerous tags
        .replace(
          /<\/?(?:script|iframe|object|embed|applet|form|base|meta|link)\b[^>]*>/gi,
          '',
        )
        // 3. Remove all inline event handlers (e.g. onerror=..., onload=..., onclick=...)
        .replace(
          /\s+on[a-z0-9_-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
          '',
        )
        // 4. Neutralize javascript:, vbscript:, and non-image data: URIs in link/resource attributes
        .replace(
          /(href|src|action|formaction|background|poster)\s*=\s*(["']?)\s*(?:javascript|vbscript|data:(?!image\/))/gi,
          '$1=$2unsafe-blocked:',
        )
        // 5. Remove CSS expressions (IE legacy XSS vector)
        .replace(/expression\s*\([^)]*\)/gi, '')
    );
  }

  private stripHtml(html: string) {
    return this.sanitizeHtml(html)
      .replace(/<[^>]*>/g, '')
      .trim();
  }
}
