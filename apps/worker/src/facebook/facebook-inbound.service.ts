import { Injectable } from '@nestjs/common';
import {
  MockFacebookCommentPayload,
  MockFacebookMessagePayload,
  NormalizedFacebookMessage,
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

@Injectable()
export class FacebookInboundService {
  constructor(private readonly prisma: PrismaService) {}

  async process(inboundEvent: InboundEvent) {
    const normalized = this.normalizePayload(
      inboundEvent.rawPayload,
      inboundEvent.dedupKey,
    );
    const channelType =
      normalized.channelType === 'FACEBOOK_MESSAGE'
        ? ChannelType.FACEBOOK_MESSAGE
        : ChannelType.FACEBOOK_COMMENT;
    const receivedAt = new Date(normalized.message.receivedAt);

    await this.prisma.$transaction(async (tx) => {
      const channelAccount = await this.findOrCreateChannelAccount(
        tx,
        normalized,
      );
      const customer = await this.findOrCreateCustomer(tx, normalized);

      let conversation = await tx.conversation.findFirst({
        where: {
          channelType,
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
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            customerId: customer.id,
            subject: conversation.subject ?? this.buildSubject(normalized),
            lastMessageAt: receivedAt,
          },
        });
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
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            inboundEventId: inboundEvent.id,
            direction: MessageDirection.INBOUND,
            senderType: MessageSenderType.CUSTOMER,
            content: normalized.message.content,
            contentType: MessageContentType.TEXT,
            externalMessageId: normalized.externalMessageId,
            rawPayload: normalized.rawPayload,
            deliveryStatus: MessageDeliveryStatus.RECEIVED,
            createdAt: receivedAt,
          },
        });
      }

      if (!conversation.ticket) {
        await tx.ticket.create({
          data: {
            conversationId: conversation.id,
            status: TicketStatus.NEW,
          },
        });
      }

      await tx.inboundEvent.update({
        where: { id: inboundEvent.id },
        data: {
          normalizedStatus: InboundEventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    });
  }

  private normalizePayload(
    rawPayload: Prisma.JsonValue,
    dedupKey: string,
  ): NormalizedFacebookMessage {
    if (this.isMessagePayload(rawPayload)) {
      return {
        provider: 'FACEBOOK',
        channelType: 'FACEBOOK_MESSAGE',
        externalMessageId: rawPayload.messageId,
        externalConversationId: `FB_MSG:${rawPayload.pageId}:${
          rawPayload.threadId ?? rawPayload.senderId
        }`,
        customer: {
          externalId: rawPayload.senderId,
          name: rawPayload.senderName,
        },
        message: {
          content: rawPayload.text,
          contentType: MessageContentType.TEXT,
          receivedAt: rawPayload.sentAt ?? new Date().toISOString(),
        },
        source: {
          pageId: rawPayload.pageId,
          channelAccountId: rawPayload.channelAccountId,
          threadId: rawPayload.threadId,
        },
        rawPayload,
        dedupKey: this.assertMessageDedupKey(dedupKey),
      };
    }

    if (this.isCommentPayload(rawPayload)) {
      return {
        provider: 'FACEBOOK',
        channelType: 'FACEBOOK_COMMENT',
        externalMessageId: rawPayload.commentId,
        externalConversationId: `FB_COMMENT:${rawPayload.pageId}:${rawPayload.postId}:${rawPayload.commentId}`,
        customer: {
          externalId: rawPayload.commenterId,
          name: rawPayload.commenterName,
        },
        message: {
          content: rawPayload.text,
          contentType: MessageContentType.TEXT,
          receivedAt: rawPayload.sentAt ?? new Date().toISOString(),
        },
        source: {
          pageId: rawPayload.pageId,
          channelAccountId: rawPayload.channelAccountId,
          postId: rawPayload.postId,
          commentId: rawPayload.commentId,
          parentCommentId: rawPayload.parentCommentId,
        },
        rawPayload,
        dedupKey: this.assertCommentDedupKey(dedupKey),
      };
    }

    throw new Error('Invalid Facebook payload');
  }

  private isMessagePayload(
    value: Prisma.JsonValue,
  ): value is MockFacebookMessagePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const payload = value as Record<string, unknown>;
    return (
      typeof payload.pageId === 'string' &&
      typeof payload.senderId === 'string' &&
      typeof payload.messageId === 'string' &&
      typeof payload.text === 'string'
    );
  }

  private isCommentPayload(
    value: Prisma.JsonValue,
  ): value is MockFacebookCommentPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const payload = value as Record<string, unknown>;
    return (
      typeof payload.pageId === 'string' &&
      typeof payload.postId === 'string' &&
      typeof payload.commentId === 'string' &&
      typeof payload.commenterId === 'string' &&
      typeof payload.text === 'string'
    );
  }

  private assertMessageDedupKey(dedupKey: string) {
    if (!dedupKey.startsWith('FACEBOOK_MESSAGE:')) {
      throw new Error('Invalid Facebook message dedup key');
    }

    return dedupKey as `FACEBOOK_MESSAGE:${string}:${string}`;
  }

  private assertCommentDedupKey(dedupKey: string) {
    if (!dedupKey.startsWith('FACEBOOK_COMMENT:')) {
      throw new Error('Invalid Facebook comment dedup key');
    }

    return dedupKey as `FACEBOOK_COMMENT:${string}:${string}`;
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
  ) {
    const existing = await tx.customer.findFirst({
      where: { externalFacebookId: normalized.customer.externalId },
    });

    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          name: existing.name ?? normalized.customer.name,
          externalFacebookId: normalized.customer.externalId,
        },
      });
    }

    return tx.customer.create({
      data: {
        name: normalized.customer.name,
        externalFacebookId: normalized.customer.externalId,
      },
    });
  }

  private buildSubject(normalized: NormalizedFacebookMessage) {
    if (normalized.channelType === 'FACEBOOK_COMMENT') {
      return `Facebook Comment - ${normalized.source.postId}`;
    }

    return `Facebook Messenger - ${
      normalized.customer.name ?? normalized.customer.externalId
    }`;
  }
}
