import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChannelType,
  ConversationStatus,
  OutboundProvider,
  UserRole,
} from '@prisma/client';
import { QUEUE_NAMES, REALTIME_EVENT_TYPES } from '@omnidesk/shared';
import { QueuesService } from '../../common/queues/queues.service';
import { StorageService } from '../../common/storage/storage.service';
import type { CurrentUser } from '../../common/auth/current-user.type';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';
import { OutboundRepository } from './outbound.repository';

@Injectable()
export class OutboundService {
  constructor(
    private readonly outboundRepository: OutboundRepository,
    private readonly queues: QueuesService,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
  ) {}

  async create(dto: CreateOutboundMessageDto, currentUser: CurrentUser) {
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

    const outboundMessage = await this.outboundRepository.createOutboundMessage(
      {
        conversationId: conversation.id,
        channelType: conversation.channelType,
        provider: delivery.provider,
        recipientExternalId: delivery.recipientExternalId,
        replyToMessageId,
        content,
      },
      currentUser.id,
    );

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

    if (rawAttachments.length > 0) {
      await this.outboundRepository.createAttachments(
        rawAttachments.map((a) => ({
          messageId: undefined as unknown as string, // will be linked by worker
          storageKey: `pending:${outboundMessage.id}:${a.key}`,
          url: a.url,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      );
    }

    const job = await this.queues.add(
      QUEUE_NAMES.OUTBOUND_MESSAGES,
      'send-outbound-message',
      {
        outboundMessageId: outboundMessage.id,
        conversationId: outboundMessage.conversationId,
        provider: outboundMessage.provider,
      },
    );

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
      jobId: job.id,
      queued: true,
    };
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

  async uploadAttachment(file: Express.Multer.File) {
    const ALLOWED_MIME_TYPES = new Set([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);

    const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    const DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Supported: JPEG, PNG, GIF, WEBP, PDF, DOCX, XLSX`,
      );
    }

    const isImage = file.mimetype.startsWith('image/');
    const maxBytes = isImage ? IMAGE_MAX_BYTES : DOC_MAX_BYTES;

    if (file.size > maxBytes) {
      const limitMb = maxBytes / 1024 / 1024;
      throw new BadRequestException(
        `File size ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the ${limitMb} MB limit`,
      );
    }

    return this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
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
