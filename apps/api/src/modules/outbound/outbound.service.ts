import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChannelType,
  ConversationStatus,
  OutboundProvider,
} from '@prisma/client';
import { QUEUE_NAMES, REALTIME_EVENT_TYPES } from '@omnidesk/shared';
import { QueuesService } from '../../common/queues/queues.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';
import { OutboundRepository } from './outbound.repository';

@Injectable()
export class OutboundService {
  constructor(
    private readonly outboundRepository: OutboundRepository,
    private readonly queues: QueuesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateOutboundMessageDto, createdBy: string) {
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
        content: dto.content.trim(),
      },
      createdBy,
    );

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
}
