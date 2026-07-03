import { Injectable } from '@nestjs/common';
import {
  MockInboundEmailPayload,
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
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';

@Injectable()
export class EmailInboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async process(inboundEvent: InboundEvent) {
    const normalized = this.normalizePayload(
      inboundEvent.rawPayload,
      inboundEvent.dedupKey,
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
        const result = await tx.conversation.updateMany({
          where: { id: conversation.id, version: conversation.version },
          data: {
            customerId: customer.id,
            subject: conversation.subject ?? normalized.message.subject,
            lastMessageAt: receivedAt,
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
      }

      if (!conversation.ticket) {
        const priority = conversation.priority ?? 'MEDIUM';
        const ticket = await tx.ticket.create({
          data: {
            conversationId: conversation.id,
            status: TicketStatus.NEW,
            priority,
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
    const occurredAt = new Date().toISOString();

    if (plan.conversationCreated) {
      await this.realtimeEventsPublisher.publish(
        {
          type: REALTIME_EVENT_TYPES.CONVERSATION_CREATED,
          conversationId: plan.conversationId,
          occurredAt,
        },
        [conversationRoom],
      );
    } else {
      await this.realtimeEventsPublisher.publish(
        {
          type: REALTIME_EVENT_TYPES.CONVERSATION_UPDATED,
          conversationId: plan.conversationId,
          occurredAt,
        },
        [conversationRoom],
      );
    }

    if (plan.messageId) {
      await this.realtimeEventsPublisher.publish(
        {
          type: REALTIME_EVENT_TYPES.MESSAGE_CREATED,
          conversationId: plan.conversationId,
          messageId: plan.messageId,
          occurredAt,
        },
        [conversationRoom],
      );
    }

    if (plan.ticketId) {
      await this.realtimeEventsPublisher.publish(
        {
          type: REALTIME_EVENT_TYPES.TICKET_UPDATED,
          conversationId: plan.conversationId,
          ticketId: plan.ticketId,
          occurredAt,
        },
        [conversationRoom],
      );
    }
  }

  private normalizePayload(
    rawPayload: Prisma.JsonValue,
    dedupKey: string,
  ): NormalizedEmailMessage {
    if (!this.isEmailPayload(rawPayload)) {
      throw new Error('Invalid email payload');
    }

    const contentType =
      rawPayload.contentType === MessageContentType.HTML || rawPayload.html
        ? MessageContentType.HTML
        : MessageContentType.TEXT;
    const content =
      contentType === MessageContentType.HTML
        ? this.sanitizeHtml(rawPayload.html ?? rawPayload.text ?? '')
        : (rawPayload.text ?? this.stripHtml(rawPayload.html ?? ''));
    const threadKey =
      rawPayload.threadId ??
      rawPayload.inReplyTo ??
      this.normalizeSubject(rawPayload.subject);

    return {
      provider: 'EMAIL',
      channelType: 'EMAIL',
      externalMessageId: rawPayload.messageId,
      externalConversationId: `EMAIL:${rawPayload.mailbox.toLowerCase()}:${threadKey}`,
      customer: {
        name: rawPayload.fromName,
        email: rawPayload.fromEmail.toLowerCase(),
      },
      message: {
        subject: rawPayload.subject,
        content,
        contentType,
        receivedAt: rawPayload.receivedAt ?? new Date().toISOString(),
      },
      source: {
        mailbox: rawPayload.mailbox,
        channelAccountId: rawPayload.channelAccountId,
        toEmail: rawPayload.toEmail,
        threadId: rawPayload.threadId,
        inReplyTo: rawPayload.inReplyTo,
      },
      rawPayload,
      dedupKey,
    };
  }

  private isEmailPayload(
    value: Prisma.JsonValue,
  ): value is MockInboundEmailPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const payload = value as Record<string, unknown>;
    return (
      typeof payload.mailbox === 'string' &&
      typeof payload.messageId === 'string' &&
      typeof payload.fromEmail === 'string' &&
      typeof payload.subject === 'string' &&
      (typeof payload.text === 'string' || typeof payload.html === 'string')
    );
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
      update: {},
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

  private sanitizeHtml(html: string) {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '');
  }

  private stripHtml(html: string) {
    return this.sanitizeHtml(html)
      .replace(/<[^>]*>/g, '')
      .trim();
  }
}
