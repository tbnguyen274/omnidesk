import { ForbiddenException, Injectable } from '@nestjs/common';
import { ChannelType, InboundEventType, InboundProvider } from '@prisma/client';
import {
  MockFacebookCommentPayload,
  MockFacebookMessagePayload,
} from '@omnidesk/shared';
import { providerConfig } from '../../config/provider.config';
import { EventsService } from '../events/events.service';
import { MockFacebookCommentDto } from './dto/mock-facebook-comment.dto';
import { MockFacebookMessageDto } from './dto/mock-facebook-message.dto';
import { FacebookWebhookParserService } from './services/facebook-webhook-parser.service';

type VerifyWebhookParams = {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
};

@Injectable()
export class FacebookService {
  constructor(
    private readonly events: EventsService,
    private readonly webhookParser: FacebookWebhookParserService,
  ) {}

  verifyWebhook(params: VerifyWebhookParams) {
    const expectedToken =
      providerConfig.facebook.verifyToken ?? 'omnidesk-facebook-verify-token';

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
    const parsedEvents = this.webhookParser.parse(payload);
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
      this.webhookParser.buildMessageDedupKey(dto.pageId, dto.messageId),
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
      this.webhookParser.buildCommentDedupKey(dto.pageId, dto.commentId),
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
}
