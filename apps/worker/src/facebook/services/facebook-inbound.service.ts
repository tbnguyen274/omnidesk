import { Injectable, Logger } from '@nestjs/common';
import {
  FacebookCommentInboundPayload,
  FacebookCommentPayloadSchema,
  FacebookMessageInboundPayload,
  FacebookMessagePayloadSchema,
  NormalizedFacebookMessage,
  FacebookMessageDedupKey,
  FacebookCommentDedupKey,
} from '@omnidesk/shared';
import { InboundEvent, InboundEventStatus, MessageContentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookInboundRepository } from '../repositories/facebook-inbound.repository';

@Injectable()
export class FacebookInboundService {
  private readonly logger = new Logger(FacebookInboundService.name);

  constructor(
    private readonly facebookInboundRepository: FacebookInboundRepository,
    private readonly prisma: PrismaService,
  ) {}

  async process(inboundEvent: InboundEvent) {
    const isMsg = inboundEvent.dedupKey.startsWith('FACEBOOK_MESSAGE:');
    const isComment = inboundEvent.dedupKey.startsWith('FACEBOOK_COMMENT:');

    if (isMsg) {
      const parsed = FacebookMessagePayloadSchema.safeParse(
        inboundEvent.rawPayload,
      );
      if (!parsed.success) {
        this.logger.error(
          `Permanent schema mismatch for Facebook message inbound event ${inboundEvent.id}: ${parsed.error.message}`,
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
      const normalized = this.normalizeMessagePayload(
        parsed.data,
        this.assertMessageDedupKey(inboundEvent.dedupKey),
        inboundEvent.rawPayload,
      );
      await this.facebookInboundRepository.persistInboundEvent(
        inboundEvent,
        normalized,
      );
      return;
    }

    if (isComment) {
      const parsed = FacebookCommentPayloadSchema.safeParse(
        inboundEvent.rawPayload,
      );
      if (!parsed.success) {
        this.logger.error(
          `Permanent schema mismatch for Facebook comment inbound event ${inboundEvent.id}: ${parsed.error.message}`,
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
      const normalized = this.normalizeCommentPayload(
        parsed.data,
        this.assertCommentDedupKey(inboundEvent.dedupKey),
        inboundEvent.rawPayload,
      );
      await this.facebookInboundRepository.persistInboundEvent(
        inboundEvent,
        normalized,
      );
      return;
    }

    this.logger.error(
      `Invalid dedupKey for Facebook inbound event ${inboundEvent.id}: ${inboundEvent.dedupKey}`,
    );
    await this.prisma.inboundEvent.update({
      where: { id: inboundEvent.id },
      data: {
        normalizedStatus: InboundEventStatus.FAILED,
        errorMessage: `Invalid dedupKey prefix: ${inboundEvent.dedupKey}`,
      },
    });
  }

  private normalizeMessagePayload(
    payload: FacebookMessageInboundPayload,
    dedupKey: FacebookMessageDedupKey,
    rawPayload: Prisma.JsonValue,
  ): NormalizedFacebookMessage {
    return {
      provider: 'FACEBOOK',
      channelType: 'FACEBOOK_MESSAGE',
      externalMessageId: payload.messageId,
      externalConversationId: `FB_MSG:${payload.pageId}:${
        payload.threadId ?? payload.senderId
      }`,
      customer: {
        externalId: payload.senderId,
        name: payload.senderName,
      },
      message: {
        content: payload.text,
        contentType: MessageContentType.TEXT,
        receivedAt: payload.sentAt ?? new Date().toISOString(),
      },
      source: {
        pageId: payload.pageId,
        channelAccountId: payload.channelAccountId,
        threadId: payload.threadId,
      },
      rawPayload: rawPayload as any,
      dedupKey,
    };
  }

  private normalizeCommentPayload(
    payload: FacebookCommentInboundPayload,
    dedupKey: FacebookCommentDedupKey,
    rawPayload: Prisma.JsonValue,
  ): NormalizedFacebookMessage {
    const threadId = payload.parentCommentId || payload.commentId;
    return {
      provider: 'FACEBOOK',
      channelType: 'FACEBOOK_COMMENT',
      externalMessageId: payload.commentId,
      externalConversationId: `FB_COMMENT:${payload.pageId}:${payload.postId}:${threadId}`,
      customer: {
        externalId: payload.commenterId,
        name: payload.commenterName,
      },
      message: {
        content: payload.text,
        contentType: MessageContentType.TEXT,
        receivedAt: payload.sentAt ?? new Date().toISOString(),
      },
      source: {
        pageId: payload.pageId,
        channelAccountId: payload.channelAccountId,
        postId: payload.postId,
        commentId: payload.commentId,
        parentCommentId: payload.parentCommentId,
        postUrl: payload.postUrl,
      },
      rawPayload: rawPayload as any,
      dedupKey,
    };
  }

  private assertMessageDedupKey(dedupKey: string): FacebookMessageDedupKey {
    if (!dedupKey.startsWith('FACEBOOK_MESSAGE:')) {
      throw new Error('Invalid Facebook message dedup key');
    }

    return dedupKey as FacebookMessageDedupKey;
  }

  private assertCommentDedupKey(dedupKey: string): FacebookCommentDedupKey {
    if (!dedupKey.startsWith('FACEBOOK_COMMENT:')) {
      throw new Error('Invalid Facebook comment dedup key');
    }

    return dedupKey as FacebookCommentDedupKey;
  }
}
