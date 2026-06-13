import { Injectable, NotFoundException } from '@nestjs/common';
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

    const outboundMessage = await this.outboundRepository.createOutboundMessage(
      dto,
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
}
