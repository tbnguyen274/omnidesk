import { Injectable } from '@nestjs/common';
import {
  NormalizedFacebookMessage,
  REALTIME_EVENT_TYPES,
  calculateSlaDueAt,
  decrypt,
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
import { PrismaService } from '../../database/prisma.service';
import { RealtimeEventsPublisher } from '../../realtime/realtime-events.publisher';

@Injectable()
export class FacebookInboundRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async persistInboundEvent(
    inboundEvent: InboundEvent,
    normalized: NormalizedFacebookMessage,
  ) {
    const channelType =
      normalized.channelType === 'FACEBOOK_MESSAGE'
        ? ChannelType.FACEBOOK_MESSAGE
        : ChannelType.FACEBOOK_COMMENT;
    const receivedAt = new Date(normalized.message.receivedAt);

    const publishPlan = await this.prisma.$transaction(async (tx) => {
      let conversationCreated = false;
      let messageId: string | null = null;
      let ticketId: string | null = null;

      const channelAccount = await this.findOrCreateChannelAccount(
        tx,
        normalized,
      );
      const customer = await this.findOrCreateCustomer(
        tx,
        normalized,
        channelAccount,
      );

      // Acquire a row-level lock on the customer to prevent race conditions
      // for concurrent webhooks of the same customer.
      await tx.$executeRaw`SELECT 1 FROM "customers" WHERE "id" = ${customer.id}::uuid FOR UPDATE`;

      let conversation = await tx.conversation.findFirst({
        where: {
          channelType,
          channelAccountId: channelAccount.id,
          externalConversationId: normalized.externalConversationId,
        },
        orderBy: {
          createdAt: 'desc',
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
            channelType,
            channelAccountId: channelAccount.id,
            customerId: customer.id,
            externalConversationId: normalized.externalConversationId,
            subject: this.buildSubject(normalized),
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
            subject:
              !conversation.subject ||
              conversation.subject.startsWith('Facebook Messenger -') ||
              conversation.subject.startsWith('Comment from ') ||
              conversation.subject.includes('Unknown Customer') ||
              conversation.subject.includes('undefined')
                ? this.buildSubject(normalized)
                : conversation.subject,
            lastMessageAt: receivedAt,
            status: isResolved ? ConversationStatus.IN_PROGRESS : undefined,
            resolvedAt: isResolved ? null : undefined,
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          throw new Error('OCC Conflict: Conversation was updated by another process. Worker will retry.');
        }

        if (isResolved && conversation.ticket) {
          await tx.ticket.update({
            where: { id: conversation.ticket.id },
            data: {
              status: TicketStatus.IN_PROGRESS,
              resolvedAt: null,
            },
          });
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
        if (
          conversationCreated &&
          normalized.channelType === 'FACEBOOK_COMMENT'
        ) {
          await tx.message.create({
            data: {
              conversationId: conversation.id,
              direction: MessageDirection.INBOUND,
              senderType: MessageSenderType.SYSTEM,
              content: `Original Facebook Post: https://facebook.com/${normalized.source.postId}`,
              contentType: MessageContentType.SYSTEM,
              externalMessageId: `sys_post_link_${normalized.source.postId}_${conversation.id}`,
              deliveryStatus: MessageDeliveryStatus.RECEIVED,
              createdAt: new Date(receivedAt.getTime() - 1000), // Appear right before the comment
            },
          });
        }

        const isFromPage =
          normalized.customer.externalId === normalized.source.pageId;

        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            inboundEventId: inboundEvent.id,
            direction: isFromPage
              ? MessageDirection.OUTBOUND
              : MessageDirection.INBOUND,
            senderType: isFromPage
              ? MessageSenderType.AGENT
              : MessageSenderType.CUSTOMER,
            content: normalized.message.content,
            contentType: MessageContentType.TEXT,
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

    await this.realtimeEventsPublisher.publish(
      {
        type: plan.conversationCreated
          ? REALTIME_EVENT_TYPES.CONVERSATION_CREATED
          : REALTIME_EVENT_TYPES.CONVERSATION_UPDATED,
        conversationId: plan.conversationId,
        occurredAt,
      },
      [conversationRoom],
    );

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
          ticketId: plan.ticketId,
          conversationId: plan.conversationId,
          occurredAt,
        },
        [conversationRoom],
      );
    }
  }

  private async findOrCreateChannelAccount(
    tx: Prisma.TransactionClient,
    normalized: NormalizedFacebookMessage,
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
        type: ChannelAccountType.FACEBOOK,
        externalId: normalized.source.pageId,
      },
    });

    if (channelAccount) {
      return channelAccount;
    }

    return tx.channelAccount.create({
      data: {
        type: ChannelAccountType.FACEBOOK,
        displayName: `Facebook Page - ${normalized.source.pageId}`,
        externalId: normalized.source.pageId,
        configJson: {
          mode: 'mock',
          pageId: normalized.source.pageId,
        },
      },
    });
  }

  private async findOrCreateCustomer(
    tx: Prisma.TransactionClient,
    normalized: NormalizedFacebookMessage,
    channelAccount: { id: string },
  ) {
    if (!normalized.customer.externalId) {
      throw new Error('Customer external ID is missing');
    }

    let customerName = normalized.customer.name;
    if (!customerName || customerName === 'Unknown Customer') {
      if (normalized.channelType === 'FACEBOOK_COMMENT') {
        try {
          const ca = await tx.channelAccount.findUnique({
            where: { id: channelAccount.id },
            select: { accessTokenEncrypted: true },
          });
          if (ca?.accessTokenEncrypted) {
            const encryptionKey = process.env.ENCRYPTION_KEY;
            const plainToken = encryptionKey
              ? decrypt(ca.accessTokenEncrypted, encryptionKey)
              : ca.accessTokenEncrypted;
            const response = await fetch(
              `https://graph.facebook.com/v19.0/${normalized.customer.externalId}?fields=first_name,last_name&access_token=${plainToken}`,
            );
            if (response.ok) {
              const data = (await response.json()) as {
                first_name?: string;
                last_name?: string;
              };
              customerName =
                `${data.first_name || ''} ${data.last_name || ''}`.trim();
              if (customerName) {
                normalized.customer.name = customerName;
              }
            }
          }
        } catch (e) {
          console.error('Failed to fetch Facebook profile:', e);
        }
      }
    }

    return tx.customer.upsert({
      where: { externalFacebookId: normalized.customer.externalId },
      update: {},
      create: {
        name: customerName,
        externalFacebookId: normalized.customer.externalId,
      },
    });
  }

  private buildSubject(normalized: NormalizedFacebookMessage) {
    if (normalized.channelType === 'FACEBOOK_COMMENT') {
      const preview =
        normalized.message.content.length > 50
          ? normalized.message.content.substring(0, 47) + '...'
          : normalized.message.content;
      const name = normalized.customer.name || normalized.customer.externalId;
      return `Facebook Comment - ${name}: "${preview}"`;
    }

    const name = normalized.customer.name || normalized.customer.externalId;
    return `Facebook Messenger - ${name}`;
  }
}
