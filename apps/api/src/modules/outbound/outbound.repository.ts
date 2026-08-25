import { Injectable } from '@nestjs/common';
import {
  ChannelType,
  MessageContentType,
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
  contentType?: MessageContentType;
};

export type CreateAttachmentInput = {
  messageId: string;
  storageKey: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
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
        assignedAgentId: true,
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
        conversationId: input.conversationId,
        channelType: input.channelType,
        provider: input.provider,
        recipientExternalId: input.recipientExternalId,
        replyToMessageId: input.replyToMessageId,
        content: input.content,
        status: OutboundMessageStatus.PENDING,
        createdBy,
      },
    });
  }

  createAttachment(input: CreateAttachmentInput) {
    return this.prisma.attachment.create({ data: input });
  }

  createAttachments(inputs: CreateAttachmentInput[]) {
    if (inputs.length === 0) return Promise.resolve([]);
    return this.prisma.$transaction(
      inputs.map((input) => this.prisma.attachment.create({ data: input })),
    );
  }
}
