import { Injectable } from '@nestjs/common';
import {
  ConversationStatus,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  MessageSenderType,
  OutboundProvider,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FacebookOutboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createTimelineMessage(outboundMessageId: string) {
    const outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: outboundMessageId },
      include: {
        conversation: true,
      },
    });

    if (
      !outboundMessage ||
      outboundMessage.provider !== OutboundProvider.FACEBOOK
    ) {
      return;
    }

    const externalMessageId = outboundMessage.externalMessageId || `mock_fb_${outboundMessage.id}`;
    const existingMessage = await this.prisma.message.findUnique({
      where: {
        conversationId_externalMessageId: {
          conversationId: outboundMessage.conversationId,
          externalMessageId,
        },
      },
    });

    if (existingMessage) {
      return;
    }

    const sentAt = new Date();

    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: outboundMessage.conversationId,
          direction: MessageDirection.OUTBOUND,
          senderType: MessageSenderType.AGENT,
          senderId: outboundMessage.createdBy,
          content: outboundMessage.content,
          contentType: MessageContentType.TEXT,
          externalMessageId,
          deliveryStatus: MessageDeliveryStatus.SENT,
          sentAt,
          createdAt: sentAt,
        },
      }),
      this.prisma.conversation.update({
        where: { id: outboundMessage.conversationId },
        data: {
          lastMessageAt: sentAt,
          status:
            outboundMessage.conversation.status === ConversationStatus.NEW
              ? ConversationStatus.IN_PROGRESS
              : undefined,
          firstResponseAt:
            outboundMessage.conversation.firstResponseAt ?? sentAt,
        },
      }),
    ]);
  }
}
