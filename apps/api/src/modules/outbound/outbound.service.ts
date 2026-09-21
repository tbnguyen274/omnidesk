import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ChannelType,
  ConversationStatus,
  OutboundProvider,
  Prisma,
  UserRole,
} from '@prisma/client';
import { REALTIME_EVENT_TYPES } from '@omnidesk/shared';
import type { CurrentUser } from '../../common/auth/current-user.type';
import { OutboxDispatcherService } from '../../common/outbox/outbox-dispatcher.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';
import { OutboundRepository } from './outbound.repository';

@Injectable()
export class OutboundService {
  constructor(
    private readonly outboundRepository: OutboundRepository,
    private readonly outboxDispatcher: OutboxDispatcherService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateOutboundMessageDto,
    currentUser: CurrentUser,
    rawIdempotencyKey?: string,
  ) {
    const idempotencyKey = this.normalizeIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.createRequestHash(dto);

    if (idempotencyKey) {
      const existing = await this.outboundRepository.findByIdempotencyKey(
        currentUser.id,
        idempotencyKey,
      );
      if (existing) {
        return this.resolveIdempotentResult(existing, requestHash);
      }
    }

    const conversation = await this.outboundRepository.findConversationById(
      dto.conversationId,
    );

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.status === ConversationStatus.CLOSED) {
      throw new ConflictException(
        'Cannot send a message to a closed conversation',
      );
    }

    if (
      currentUser.role === UserRole.AGENT &&
      conversation.assignedAgentId &&
      conversation.assignedAgentId !== currentUser.id
    ) {
      throw new ForbiddenException('Conversation is assigned to another agent');
    }

    const content = dto.content.trim();
    this.validateContentLength(conversation.channelType, content);

    const replyTarget = dto.replyToMessageId
      ? await this.outboundRepository.findReplyTarget(
          conversation.id,
          dto.replyToMessageId,
        )
      : null;

    if (dto.replyToMessageId && !replyTarget) {
      throw new BadRequestException(
        'Reply target does not belong to this conversation',
      );
    }

    const delivery = this.resolveDelivery(conversation);
    const replyToMessageId = replyTarget
      ? this.resolveReplyTarget(conversation.channelType, replyTarget)
      : undefined;

    // Persist attachment records using a "pending" storageKey convention so the
    // worker can look them up before the timeline Message row is created.
    const rawAttachments =
      dto.attachments && dto.attachments.length > 0
        ? dto.attachments.map((a) => ({
            url: a.url,
            key: this.extractKeyFromUrl(a.url),
            fileName: a.fileName,
            mimeType: a.mimeType || 'application/octet-stream',
            sizeBytes: a.sizeBytes || 0,
          }))
        : dto.attachmentUrls && dto.attachmentUrls.length > 0
          ? this.resolveAttachmentMetas(dto.attachmentUrls)
          : [];

    let outboundMessage;
    try {
      outboundMessage = await this.outboundRepository.createSendRequest(
        {
          conversationId: conversation.id,
          channelType: conversation.channelType,
          provider: delivery.provider,
          recipientExternalId: delivery.recipientExternalId,
          replyToMessageId,
          content,
        },
        rawAttachments,
        currentUser.id,
        idempotencyKey,
        requestHash,
      );
    } catch (error) {
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.outboundRepository.findByIdempotencyKey(
          currentUser.id,
          idempotencyKey,
        );
        if (existing) {
          return this.resolveIdempotentResult(existing, requestHash);
        }
      }
      throw error;
    }

    this.outboxDispatcher.trigger();

    this.notificationsService.publishToConversation(
      outboundMessage.conversationId,
      {
        type: REALTIME_EVENT_TYPES.OUTBOUND_MESSAGE_UPDATED,
        outboundMessageId: outboundMessage.id,
        conversationId: outboundMessage.conversationId,
        status: outboundMessage.status,
        occurredAt: new Date().toISOString(),
      },
    );

    return {
      outboundMessage,
      jobId: null,
      queued: true,
      duplicated: false,
    };
  }

  private resolveIdempotentResult(
    outboundMessage: { requestHash: string | null },
    requestHash: string,
  ) {
    if (outboundMessage.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different request',
      );
    }

    return {
      outboundMessage,
      jobId: null,
      queued: true,
      duplicated: true,
    };
  }

  private normalizeIdempotencyKey(value?: string) {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (normalized.length > 200) {
      throw new BadRequestException(
        'Idempotency-Key must not exceed 200 characters',
      );
    }
    return normalized;
  }

  private createRequestHash(dto: CreateOutboundMessageDto) {
    const canonical = {
      conversationId: dto.conversationId,
      content: dto.content.trim(),
      replyToMessageId: dto.replyToMessageId ?? null,
      attachments: (dto.attachments ?? []).map((attachment) => ({
        url: attachment.url,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType ?? 'application/octet-stream',
        sizeBytes: attachment.sizeBytes ?? 0,
      })),
      attachmentUrls: dto.attachmentUrls ?? [],
    };

    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private resolveDelivery(conversation: {
    channelType: ChannelType;
    customer: { email: string | null; externalFacebookId: string | null };
  }) {
    if (conversation.channelType === ChannelType.EMAIL) {
      if (!conversation.customer.email) {
        throw new BadRequestException('Customer email is missing');
      }

      return {
        provider: OutboundProvider.EMAIL,
        recipientExternalId: conversation.customer.email,
      };
    }

    if (conversation.channelType === ChannelType.FACEBOOK_MESSAGE) {
      if (!conversation.customer.externalFacebookId) {
        throw new BadRequestException('Customer Facebook id is missing');
      }

      return {
        provider: OutboundProvider.FACEBOOK,
        recipientExternalId: conversation.customer.externalFacebookId,
      };
    }

    return {
      provider: OutboundProvider.FACEBOOK,
      recipientExternalId: undefined,
    };
  }

  private resolveReplyTarget(
    channelType: ChannelType,
    replyTarget: { id: string; externalMessageId: string | null },
  ) {
    if (
      channelType === ChannelType.FACEBOOK_COMMENT &&
      !replyTarget.externalMessageId
    ) {
      throw new BadRequestException(
        'Facebook comment reply target has no provider message id',
      );
    }

    return replyTarget.externalMessageId ?? replyTarget.id;
  }

  private validateContentLength(channelType: ChannelType, content: string) {
    const maxLength = channelType === ChannelType.EMAIL ? 10_000 : 2_000;

    if (content.length > maxLength) {
      throw new BadRequestException(
        `Content exceeds the ${maxLength} character limit for ${channelType}`,
      );
    }
  }

  private extractKeyFromUrl(url: string): string {
    const publicBase = (
      process.env.MINIO_PUBLIC_URL ??
      `http://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? '9000'}/${process.env.MINIO_BUCKET ?? 'omnidesk'}`
    ).replace(/\/$/, '');

    return url.startsWith(publicBase) ? url.slice(publicBase.length + 1) : url;
  }

  /**
   * Given a list of public attachment URLs, resolve their MinIO key and metadata
   * by querying the DB for pending attachment records.
   */
  private resolveAttachmentMetas(urls: string[]) {
    return urls.map((url) => {
      const key = this.extractKeyFromUrl(url);
      const segments = key.split('/');
      const fileName = segments[segments.length - 1];
      return {
        url,
        key,
        fileName,
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
      };
    });
  }
}
