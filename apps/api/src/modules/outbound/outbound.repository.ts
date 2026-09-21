import { Injectable } from '@nestjs/common';
import {
  ChannelType,
  MessageContentType,
  MessageDirection,
  OutboundMessageStatus,
  OutboundProvider,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';

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
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class OutboundRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

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

  findByIdempotencyKey(createdBy: string, idempotencyKey: string) {
    return this.prisma.outboundMessage.findUnique({
      where: {
        createdBy_idempotencyKey: { createdBy, idempotencyKey },
      },
    });
  }

  async createSendRequest(
    input: CreateOutboundMessageInput,
    attachments: CreateAttachmentInput[],
    createdBy: string,
    idempotencyKey?: string,
    requestHash?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const outboundMessage = await tx.outboundMessage.create({
        data: {
          conversationId: input.conversationId,
          channelType: input.channelType,
          provider: input.provider,
          recipientExternalId: input.recipientExternalId,
          replyToMessageId: input.replyToMessageId,
          content: input.content,
          status: OutboundMessageStatus.PENDING,
          idempotencyKey,
          requestHash,
          createdBy,
        },
      });

      if (attachments.length > 0) {
        await tx.attachment.createMany({
          data: attachments.map((attachment) => ({
            messageId: null,
            storageKey: `pending:${outboundMessage.id}:${attachment.key}`,
            url: attachment.url,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          })),
        });
      }

      await this.outbox.createEvent(
        tx,
        'OUTBOUND_MESSAGE_SEND_REQUESTED',
        outboundMessage.id,
        {
          outboundMessageId: outboundMessage.id,
          conversationId: outboundMessage.conversationId,
          provider: outboundMessage.provider,
        },
      );

      return outboundMessage;
    });
  }
}
