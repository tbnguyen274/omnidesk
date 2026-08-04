import { Injectable } from '@nestjs/common';
import {
  ChannelType,
  MessageDirection,
  OutboundMessageStatus,
  OutboundProvider,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

export type CreateOutboundMessageInput = {
  conversationId: string;
  channelType: ChannelType;
  provider: OutboundProvider;
  recipientExternalId?: string;
  replyToMessageId?: string;
  content: string;
};

@Injectable()
export class OutboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  findConversationById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        channelType: true,
        status: true,
        customer: {
          select: {
            email: true,
            externalFacebookId: true,
          },
        },
      },
    });
  }

  findReplyTarget(conversationId: string, replyToMessageId: string) {
    return this.prisma.message.findFirst({
      where: {
        conversationId,
        direction: MessageDirection.INBOUND,
        OR: [{ id: replyToMessageId }, { externalMessageId: replyToMessageId }],
      },
      select: {
        id: true,
        externalMessageId: true,
      },
    });
  }

  createOutboundMessage(input: CreateOutboundMessageInput, createdBy: string) {
    return this.prisma.outboundMessage.create({
      data: {
        ...input,
        status: OutboundMessageStatus.PENDING,
        createdBy,
      },
    });
  }
}
