import { Injectable } from '@nestjs/common';
import { ChannelType, InboundEventType } from '@prisma/client';
import {
  MockFacebookCommentPayload,
  MockFacebookMessagePayload,
} from '@omnidesk/shared';

export type ParsedFacebookWebhookEvent = {
  rawPayload: MockFacebookMessagePayload | MockFacebookCommentPayload;
  eventType: InboundEventType;
  channelType: ChannelType;
  externalEventId: string;
  dedupKey: string;
};

@Injectable()
export class FacebookWebhookParserService {
  parse(payload: Record<string, unknown>): ParsedFacebookWebhookEvent[] {
    const parsedEvents: ParsedFacebookWebhookEvent[] = [];
    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const entryRecord = entry as Record<string, unknown>;
      const pageId = this.stringValue(entryRecord.id) ?? '';

      parsedEvents.push(...this.parseMessagingEvents(pageId, entryRecord));
      parsedEvents.push(...this.parseChangeEvents(pageId, entryRecord));
    }

    return parsedEvents;
  }

  buildMessageDedupKey(pageId: string, messageId: string) {
    return `FACEBOOK_MESSAGE:${pageId.trim()}:${messageId.trim()}`;
  }

  buildCommentDedupKey(pageId: string, commentId: string) {
    return `FACEBOOK_COMMENT:${pageId.trim()}:${commentId.trim()}`;
  }

  private parseMessagingEvents(
    pageId: string,
    entryRecord: Record<string, unknown>,
  ) {
    const parsedEvents: ParsedFacebookWebhookEvent[] = [];
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

    return parsedEvents;
  }

  private parseChangeEvents(
    pageId: string,
    entryRecord: Record<string, unknown>,
  ) {
    const parsedEvents: ParsedFacebookWebhookEvent[] = [];
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
    const isEcho = message?.is_echo === true;

    if (!pageId || !senderId || !messageId || !text || isEcho) {
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
    // Live Facebook webhook sends commenter info inside `from: { id, name }`
    // Fallback to `sender_id` / `sender_name` for mock/legacy compatibility
    const from = this.asRecord(value?.from);
    const commenterId =
      this.stringValue(from?.id) ?? this.stringValue(value?.sender_id);
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

    const parentId = this.stringValue(value?.parent_id);
    // For top-level comments, Facebook sets parent_id = post_id — treat as no parent
    const parentCommentId = parentId !== postId ? parentId : undefined;

    return {
      pageId,
      postId,
      commentId,
      commenterId,
      commenterName:
        this.stringValue(from?.name) ?? this.stringValue(value?.sender_name),
      text,
      sentAt: this.timestampToIso(value?.created_time),
      parentCommentId,
      postUrl: this.stringValue((value?.post as Record<string, unknown>)?.permalink_url),
    } satisfies MockFacebookCommentPayload;
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
    let numericValue: number | undefined;

    if (typeof value === 'number') {
      numericValue = value;
    } else if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        numericValue = parsed;
      }
    }

    if (numericValue !== undefined) {
      // Facebook Feed webhook sends created_time in SECONDS.
      // Facebook Messenger webhook sends timestamp in MILLISECONDS.
      // If the value is small (< 1e11), it's in seconds.
      const ms = numericValue < 1e11 ? numericValue * 1000 : numericValue;
      return new Date(ms).toISOString();
    }

    return undefined;
  }
}
