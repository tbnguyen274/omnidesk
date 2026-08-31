import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationStatus,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  MessageSenderType,
  OutboundProvider,
  Prisma,
} from '@prisma/client';
import nodemailer from 'nodemailer';
import { providerConfig } from '../config/provider.config';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';

type SendOutboundResult = {
  externalMessageId: string;
  sentAt: Date;
};

type EmailThreadHeaders = {
  inReplyTo?: string;
  references?: string[];
};

@Injectable()
export class EmailOutboundService {
  private readonly logger = new Logger(EmailOutboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

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

    const threadHeaders = await this.resolveThreadHeaders(
      outboundMessage.conversationId,
      outboundMessage.replyToMessageId,
    );

    // Fetch attachments linked to the pending outbound message via Message record
    const pendingAttachments =
      await this.fetchPendingAttachments(outboundMessageId);

    const mailAttachments = await this.downloadAttachments(pendingAttachments);

    const sent = await transporter.sendMail({
      from: providerConfig.email.smtp.fromAddress,
      to: outboundMessage.recipientExternalId,
      subject: this.buildReplySubject(outboundMessage.conversation.subject),
      text: outboundMessage.content,
      attachments: mailAttachments,
      ...threadHeaders,
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
    const pendingAttachments =
      await this.fetchPendingAttachments(outboundMessageId);
    const contentType =
      pendingAttachments.length > 0
        ? MessageContentType.ATTACHMENT
        : MessageContentType.TEXT;

    const createdMsg = await this.prisma.message.create({
      data: {
        conversationId: outboundMessage.conversationId,
        direction: MessageDirection.OUTBOUND,
        senderType: MessageSenderType.AGENT,
        senderId: outboundMessage.createdBy,
        content: outboundMessage.content,
        contentType,
        externalMessageId,
        deliveryStatus: MessageDeliveryStatus.SENT,
        sentAt,
        createdAt: sentAt,
      },
    });

    await this.prisma.conversation.update({
      where: { id: outboundMessage.conversationId },
      data: {
        lastMessageAt: sentAt,
        status:
          outboundMessage.conversation.status === ConversationStatus.NEW
            ? ConversationStatus.IN_PROGRESS
            : undefined,
        firstResponseAt: outboundMessage.conversation.firstResponseAt ?? sentAt,
      },
    });

    // Link pre-uploaded attachments to the newly created timeline message
    if (pendingAttachments.length > 0) {
      await this.prisma.$transaction(
        pendingAttachments.map((att) => {
          const realKey = att.storageKey.split(':').slice(2).join(':');
          return this.prisma.attachment.update({
            where: { id: att.id },
            data: { messageId: createdMsg.id, storageKey: realKey },
          });
        }),
      );
    }
  }

  private async resolveThreadHeaders(
    conversationId: string,
    replyToMessageId?: string | null,
  ): Promise<EmailThreadHeaders> {
    const replyTarget = await this.findReplyTarget(
      conversationId,
      replyToMessageId,
    );

    if (!replyTarget?.externalMessageId) {
      return {};
    }

    const targetMessageId = this.formatMessageId(replyTarget.externalMessageId);
    const rawPayload = this.asEmailRawPayload(replyTarget.rawPayload);
    const references = this.buildReferences(rawPayload, targetMessageId);

    return {
      inReplyTo: targetMessageId,
      references,
    };
  }

  private async findReplyTarget(
    conversationId: string,
    replyToMessageId?: string | null,
  ) {
    if (replyToMessageId) {
      const explicitTarget = await this.prisma.message.findFirst({
        where: {
          conversationId,
          direction: MessageDirection.INBOUND,
          OR: [
            { id: replyToMessageId },
            { externalMessageId: replyToMessageId },
          ],
        },
        select: {
          externalMessageId: true,
          rawPayload: true,
        },
      });

      if (explicitTarget) {
        return explicitTarget;
      }
    }

    return this.prisma.message.findFirst({
      where: {
        conversationId,
        direction: MessageDirection.INBOUND,
        externalMessageId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        externalMessageId: true,
        rawPayload: true,
      },
    });
  }

  private buildReferences(
    rawPayload: Record<string, unknown> | null,
    targetMessageId: string,
  ) {
    const references = new Set<string>();
    const rawReferences = rawPayload?.references;

    if (Array.isArray(rawReferences)) {
      for (const reference of rawReferences) {
        if (typeof reference === 'string') {
          references.add(this.formatMessageId(reference));
        }
      }
    } else if (typeof rawReferences === 'string') {
      for (const reference of rawReferences.split(/\s+/)) {
        if (reference.trim()) {
          references.add(this.formatMessageId(reference));
        }
      }
    }

    if (typeof rawPayload?.inReplyTo === 'string') {
      references.add(this.formatMessageId(rawPayload.inReplyTo));
    }

    references.add(targetMessageId);

    return Array.from(references);
  }

  private buildReplySubject(subject?: string | null) {
    const fallback = 'OmniDesk reply';
    const value = subject?.trim() || fallback;
    return /^re:/i.test(value) ? value : `Re: ${value}`;
  }

  private formatMessageId(messageId: string) {
    const trimmed = messageId.trim();
    if (!trimmed) {
      return trimmed;
    }

    return trimmed.startsWith('<') && trimmed.endsWith('>')
      ? trimmed
      : `<${trimmed.replace(/^<|>$/g, '')}>`;
  }

  private asEmailRawPayload(rawPayload: Prisma.JsonValue | null) {
    if (
      !rawPayload ||
      typeof rawPayload !== 'object' ||
      Array.isArray(rawPayload)
    ) {
      return null;
    }

    return rawPayload as Record<string, unknown>;
  }

  // ── Attachment helpers ────────────────────────────────────────────────────

  /**
   * Looks up attachments that were saved against the outbound message ID
   * (stored in storageKey as a reference before the timeline message exists).
   */
  private async fetchPendingAttachments(outboundMessageId: string) {
    return this.prisma.attachment.findMany({
      where: { storageKey: { startsWith: `pending:${outboundMessageId}:` } },
    });
  }

  private async downloadAttachments(
    attachments: { storageKey: string; fileName: string; mimeType: string }[],
  ) {
    const results: {
      filename: string;
      content: Buffer;
      contentType: string;
    }[] = [];
    for (const att of attachments) {
      // storageKey format: "pending:<outboundId>:<realKey>"
      const realKey = att.storageKey.split(':').slice(2).join(':');
      try {
        const content = await this.storageService.getObject(realKey);
        results.push({
          filename: att.fileName,
          content,
          contentType: att.mimeType,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to download attachment ${realKey}: ${String(err)}`,
        );
      }
    }
    return results;
  }

  private async linkAttachmentsToMessage(
    outboundMessageId: string,
    externalMessageId: string,
    conversationId: string,
  ) {
    const pendingAttachments =
      await this.fetchPendingAttachments(outboundMessageId);
    if (pendingAttachments.length === 0) return;

    const message = await this.prisma.message.findUnique({
      where: {
        conversationId_externalMessageId: { conversationId, externalMessageId },
      },
      select: { id: true },
    });

    if (!message) return;

    // Update each pending attachment: set real messageId and strip the pending: prefix from storageKey
    await this.prisma.$transaction(
      pendingAttachments.map((att) => {
        const realKey = att.storageKey.split(':').slice(2).join(':');
        return this.prisma.attachment.update({
          where: { id: att.id },
          data: { messageId: message.id, storageKey: realKey },
        });
      }),
    );
  }
}
