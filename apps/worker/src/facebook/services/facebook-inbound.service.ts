import { Injectable } from '@nestjs/common';
import {
  MockFacebookCommentPayload,
  MockFacebookMessagePayload,
  NormalizedFacebookMessage,
} from '@omnidesk/shared';
import { InboundEvent, MessageContentType, Prisma } from '@prisma/client';
import { FacebookInboundRepository } from '../repositories/facebook-inbound.repository';

@Injectable()
export class FacebookInboundService {
  constructor(
    private readonly facebookInboundRepository: FacebookInboundRepository,
  ) {}

  async process(inboundEvent: InboundEvent) {
    const normalized = this.normalizePayload(
      inboundEvent.rawPayload,
      inboundEvent.dedupKey,
    );
    await this.facebookInboundRepository.persistInboundEvent(
      inboundEvent,
      normalized,
    );
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
}
