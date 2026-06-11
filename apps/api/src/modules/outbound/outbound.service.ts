import { Injectable, NotFoundException } from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { OutboundMessageStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { QueuesService } from '../../common/queues/queues.service';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';

@Injectable()
export class OutboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueuesService,
  ) {}

  async create(dto: CreateOutboundMessageDto, createdBy: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const outboundMessage = await this.prisma.outboundMessage.create({
      data: {
        conversationId: dto.conversationId,
        channelType: dto.channelType,
        provider: dto.provider,
        recipientExternalId: dto.recipientExternalId,
        content: dto.content,
        status: OutboundMessageStatus.PENDING,
        createdBy,
      },
    });

    const job = await this.queues.add(
      QUEUE_NAMES.OUTBOUND_MESSAGES,
      'send-outbound-message',
      {
        outboundMessageId: outboundMessage.id,
        conversationId: outboundMessage.conversationId,
        provider: outboundMessage.provider,
      },
    );

    return {
      outboundMessage,
      jobId: job.id,
      queued: true,
    };
  }
}
