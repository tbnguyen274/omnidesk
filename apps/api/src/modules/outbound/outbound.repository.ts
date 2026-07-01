import { Injectable } from '@nestjs/common';
import { OutboundMessageStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';

@Injectable()
export class OutboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  findConversationById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  createOutboundMessage(dto: CreateOutboundMessageDto, createdBy: string) {
    return this.prisma.outboundMessage.create({
      data: {
        conversationId: dto.conversationId,
        channelType: dto.channelType,
        provider: dto.provider,
        recipientExternalId: dto.recipientExternalId,
        replyToMessageId: dto.replyToMessageId,
        content: dto.content,
        status: OutboundMessageStatus.PENDING,
        createdBy,
      },
    });
  }
}
