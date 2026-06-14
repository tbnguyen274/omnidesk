import { Injectable } from '@nestjs/common';
import {
  ConversationStatus,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  MessageSenderType,
  OutboundProvider,
} from '@prisma/client';
import nodemailer from 'nodemailer';
import { providerConfig } from '../config/provider.config';
import { PrismaService } from '../database/prisma.service';

type SendOutboundResult = {
  externalMessageId: string;
  sentAt: Date;
};

@Injectable()
export class EmailOutboundService {
  constructor(private readonly prisma: PrismaService) {}

  async sendOutboundMessage(
    outboundMessageId: string,
  ): Promise<SendOutboundResult> {
    const outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: outboundMessageId },
      include: {
        conversation: true,
      },
    });

    if (
      !outboundMessage ||
      outboundMessage.provider !== OutboundProvider.EMAIL
    ) {
      throw new Error('Email outbound message not found');
    }

    if (providerConfig.email.outboundMode !== 'live') {
      return {
        externalMessageId: `mock_${outboundMessage.id}`,
        sentAt: new Date(),
      };
    }

    if (!outboundMessage.recipientExternalId) {
      throw new Error('Email recipient is missing');
    }

    if (!providerConfig.email.smtp.fromAddress) {
      throw new Error('EMAIL_FROM_ADDRESS is required');
    }

    const transporter = nodemailer.createTransport({
      host: providerConfig.email.smtp.host,
      port: providerConfig.email.smtp.port,
      secure: providerConfig.email.smtp.secure,
      auth: {
        user: providerConfig.email.smtp.user,
        pass: providerConfig.email.smtp.password,
      },
    });

    const sent = await transporter.sendMail({
      from: providerConfig.email.smtp.fromAddress,
      to: outboundMessage.recipientExternalId,
      subject: outboundMessage.conversation.subject ?? 'OmniDesk reply',
      text: outboundMessage.content,
    });

    return {
      externalMessageId:
        sent.messageId?.toString() ?? `smtp_${outboundMessage.id}`,
      sentAt: new Date(),
    };
  }

  async createTimelineMessage(outboundMessageId: string) {
    const outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: outboundMessageId },
      include: {
        conversation: true,
      },
    });

    if (
      !outboundMessage ||
      outboundMessage.provider !== OutboundProvider.EMAIL
    ) {
      return;
    }

    const externalMessageId =
      outboundMessage.externalMessageId ?? `mock_${outboundMessage.id}`;
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
