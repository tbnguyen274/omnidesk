import { ForbiddenException, Injectable } from '@nestjs/common';
import { ChannelType, InboundEventType, InboundProvider } from '@prisma/client';
import {
  MockFacebookCommentPayload,
  MockFacebookMessagePayload,
} from '@omnidesk/shared';
import { EventsService } from '../events/events.service';
import { MockFacebookCommentDto } from './dto/mock-facebook-comment.dto';
import { MockFacebookMessageDto } from './dto/mock-facebook-message.dto';
import { FacebookRepository } from './facebook.repository';

type VerifyWebhookParams = {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
};

@Injectable()
export class FacebookService {
  constructor(
    private readonly facebookRepository: FacebookRepository,
    private readonly events: EventsService,
  ) {}

  verifyWebhook(params: VerifyWebhookParams) {
    const expectedToken =
      process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ??
      'omnidesk-facebook-verify-token';

    if (
      params.mode !== 'subscribe' ||
      params.verifyToken !== expectedToken ||
      !params.challenge
    ) {
      throw new ForbiddenException('Invalid Facebook webhook verification');
    }

    return params.challenge;
  }

  async receiveWebhook(payload: Record<string, unknown>) {
    const parsedEvents = this.parseWebhookPayload(payload);
    const results: unknown[] = [];

    for (const parsedEvent of parsedEvents) {
      results.push(
        await this.createInboundEventFromPayload(
          parsedEvent.rawPayload,
          parsedEvent.eventType,
          parsedEvent.channelType,
          parsedEvent.externalEventId,
          parsedEvent.dedupKey,
        ),
      );
    }

    return {
      received: true,
      eventCount: results.length,
      events: results,
    };
  }

  async mockMessage(dto: MockFacebookMessageDto) {
    const rawPayload: MockFacebookMessagePayload = {
      pageId: dto.pageId,
      senderId: dto.senderId,
      senderName: dto.senderName,
      messageId: dto.messageId,
      text: dto.text,
      sentAt: dto.sentAt,
      threadId: dto.threadId,
      channelAccountId: dto.channelAccountId,
    };

    return this.createInboundEventFromPayload(
      rawPayload,
      InboundEventType.MESSAGE,
      ChannelType.FACEBOOK_MESSAGE,
      dto.messageId,
      this.buildMessageDedupKey(dto.pageId, dto.messageId),
    );
  }

  async mockComment(dto: MockFacebookCommentDto) {
    const rawPayload: MockFacebookCommentPayload = {
      pageId: dto.pageId,
      postId: dto.postId,
      commentId: dto.commentId,
      commenterId: dto.commenterId,
      commenterName: dto.commenterName,
      text: dto.text,
      sentAt: dto.sentAt,
      parentCommentId: dto.parentCommentId,
      channelAccountId: dto.channelAccountId,
    };

    return this.createInboundEventFromPayload(
      rawPayload,
      InboundEventType.COMMENT,
      ChannelType.FACEBOOK_COMMENT,
      dto.commentId,
      this.buildCommentDedupKey(dto.pageId, dto.commentId),
    );
  }

  private createInboundEventFromPayload(
    rawPayload: MockFacebookMessagePayload | MockFacebookCommentPayload,
    eventType: InboundEventType,
    channelType: ChannelType,
    externalEventId: string,
    dedupKey: string,
  ) {
    return this.events.createInbound({
      provider: InboundProvider.FACEBOOK,
      eventType,
      channelType,
      externalEventId,
      dedupKey,
      rawPayload: rawPayload,
    });
  }

  private parseWebhookPayload(payload: Record<string, unknown>) {
    const parsedEvents: Array<{
      rawPayload: MockFacebookMessagePayload | MockFacebookCommentPayload;
      eventType: InboundEventType;
      channelType: ChannelType;
      externalEventId: string;
      dedupKey: string;
    }> = [];

    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const entryRecord = entry as Record<string, unknown>;
      const pageId = this.stringValue(entryRecord.id) ?? '';
      const messaging = Array.isArray(entryRecord.messaging)
        ? entryRecord.messaging
        : [];

      for (const item of messaging) {
        const messagePayload = this.parseMessagingEvent(pageId, item);

        if (messagePayload) {
          parsedEvents.push({
            rawPayload: messagePayload,
            eventType: InboundEventType.MESSAGE,
            channelType: ChannelType.FACEBOOK_MESSAGE,
            externalEventId: messagePayload.messageId,
            dedupKey: this.buildMessageDedupKey(
              messagePayload.pageId,
              messagePayload.messageId,
            ),
          });
        }
      }

      const changes = Array.isArray(entryRecord.changes)
        ? entryRecord.changes
        : [];

      for (const change of changes) {
        const commentPayload = this.parseCommentChange(pageId, change);

        if (commentPayload) {
          parsedEvents.push({
            rawPayload: commentPayload,
            eventType: InboundEventType.COMMENT,
            channelType: ChannelType.FACEBOOK_COMMENT,
            externalEventId: commentPayload.commentId,
            dedupKey: this.buildCommentDedupKey(
              commentPayload.pageId,
              commentPayload.commentId,
            ),
          });
        }
      }
    }

    return parsedEvents;
  }

  private parseMessagingEvent(pageId: string, item: unknown) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const itemRecord = item as Record<string, unknown>;
    const sender = this.asRecord(itemRecord.sender);
    const message = this.asRecord(itemRecord.message);
    const senderId = this.stringValue(sender?.id);
    const messageId = this.stringValue(message?.mid);
    const text = this.stringValue(message?.text);

    if (!pageId || !senderId || !messageId || !text) {
      return null;
    }

    return {
      pageId,
      senderId,
      messageId,
      text,
      sentAt: this.timestampToIso(itemRecord.timestamp),
    } satisfies MockFacebookMessagePayload;
  }

  private parseCommentChange(pageId: string, change: unknown) {
    if (!change || typeof change !== 'object') {
      return null;
    }

    const changeRecord = change as Record<string, unknown>;

    if (changeRecord.field !== 'feed') {
      return null;
    }

    const value = this.asRecord(changeRecord.value);
    const item = this.stringValue(value?.item);
    const verb = this.stringValue(value?.verb);
    const commentId = this.stringValue(value?.comment_id);
    const postId = this.stringValue(value?.post_id);
    const commenterId = this.stringValue(value?.sender_id);
    const text = this.stringValue(value?.message);

    if (
      item !== 'comment' ||
      verb === 'remove' ||
      !pageId ||
      !postId ||
      !commentId ||
      !commenterId ||
      !text
    ) {
      return null;
    }

    return {
      pageId,
      postId,
      commentId,
      commenterId,
      text,
      sentAt: this.timestampToIso(value?.created_time),
      parentCommentId: this.stringValue(value?.parent_id),
    } satisfies MockFacebookCommentPayload;
  }

  private buildMessageDedupKey(pageId: string, messageId: string) {
    return `FACEBOOK_MESSAGE:${pageId.trim()}:${messageId.trim()}`;
  }

  private buildCommentDedupKey(pageId: string, commentId: string) {
    return `FACEBOOK_COMMENT:${pageId.trim()}:${commentId.trim()}`;
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private timestampToIso(value: unknown) {
    if (typeof value === 'number') {
      return new Date(value).toISOString();
    }

    if (typeof value === 'string') {
      const numericValue = Number(value);

      if (!Number.isNaN(numericValue)) {
        return new Date(numericValue).toISOString();
      }
    }

    return undefined;
  }
}
