import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  OutboundMessageJobPayload,
  REALTIME_EVENT_TYPES,
} from '@omnidesk/shared';
import {
  ConversationStatus,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  MessageSenderType,
  OutboundMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OutboundAdapterRegistry } from '../outbound/adapters/outbound-adapter.registry';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';
import { PermanentJobError } from '../errors/permanent-job.error';
import { DeliveryOutcomeUnknownError } from '../errors/delivery-outcome-unknown.error';

@Injectable()
export class OutboundMessagesProcessor {
  private readonly logger = new Logger(OutboundMessagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundAdapters: OutboundAdapterRegistry,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async process(job: Job<OutboundMessageJobPayload>) {
    let outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: job.data.outboundMessageId },
    });

    if (!outboundMessage) {
      throw new PermanentJobError(
        `Outbound message ${job.data.outboundMessageId} not found — record may have been deleted`,
      );
    }

    // A previous attempt persisted the provider acknowledgement but crashed
    // before committing the local timeline. Finalize without sending again.
    if (
      outboundMessage.status === OutboundMessageStatus.SENDING &&
      outboundMessage.externalMessageId &&
      outboundMessage.sentAt
    ) {
      const sentMessage = await this.finalizeSentMessage(outboundMessage.id);
      await this.publishSentEvents(sentMessage);
      return;
    }

    if (
      outboundMessage.status === OutboundMessageStatus.SENT ||
      outboundMessage.status === OutboundMessageStatus.FAILED ||
      outboundMessage.status === OutboundMessageStatus.DELIVERY_UNKNOWN
    ) {
      this.logger.log(
        `Outbound message ${outboundMessage.id} already in terminal state ${outboundMessage.status} — skipping`,
      );
      return;
    }

    const acquired = await this.prisma.outboundMessage.updateMany({
      where: {
        id: outboundMessage.id,
        status: {
          in: [OutboundMessageStatus.PENDING, OutboundMessageStatus.RETRYING],
        },
      },
      data: {
        status: OutboundMessageStatus.SENDING,
        processingStartedAt: new Date(),
        lastError: null,
      },
    });

    if (acquired.count === 0) {
      this.logger.warn(
        `Outbound message ${outboundMessage.id} could not be claimed — another worker may be processing it`,
      );
      return;
    }

    outboundMessage = await this.prisma.outboundMessage.findUniqueOrThrow({
      where: { id: outboundMessage.id },
    });

    let providerCallSucceeded = false;
    let providerAcceptanceRecorded = false;

    try {
      await this.publishOutboundMessageUpdated(
        outboundMessage.id,
        outboundMessage.conversationId,
        outboundMessage.status,
      );

      if (
        process.env.NODE_ENV !== 'production' &&
        outboundMessage.content.toLowerCase().includes('mock_fail')
      ) {
        throw new Error('Mock outbound provider failure');
      }

      const outboundAdapter = this.outboundAdapters.get(
        outboundMessage.provider,
      );
      const { externalMessageId, sentAt } = await outboundAdapter.send(
        outboundMessage.id,
      );
      providerCallSucceeded = true;

      // Durable checkpoint: a retry can finish the local transaction without
      // performing the provider side effect again.
      await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: { externalMessageId, sentAt, lastError: null },
      });
      providerAcceptanceRecorded = true;

      const sentMessage = await this.finalizeSentMessage(outboundMessage.id);
      await this.publishSentEvents(sentMessage);
    } catch (error) {
      if (error instanceof DeliveryOutcomeUnknownError) {
        const unknownMessage = await this.prisma.outboundMessage.update({
          where: { id: outboundMessage.id },
          data: {
            status: OutboundMessageStatus.DELIVERY_UNKNOWN,
            retryCount: { increment: 1 },
            processingStartedAt: null,
            lastError: error.message,
          },
        });
        await this.publishOutboundMessageUpdated(
          unknownMessage.id,
          unknownMessage.conversationId,
          unknownMessage.status,
        );
        throw new PermanentJobError(error.message);
      }

      if (providerCallSucceeded && !providerAcceptanceRecorded) {
        const message =
          error instanceof Error ? error.message : 'Unknown persistence error';
        await this.prisma.outboundMessage
          .update({
            where: { id: outboundMessage.id },
            data: {
              status: OutboundMessageStatus.DELIVERY_UNKNOWN,
              processingStartedAt: null,
              lastError: `Provider accepted the request but its acknowledgement could not be persisted: ${message}`,
            },
          })
          .catch(() => undefined);
        throw new PermanentJobError(
          `Delivery outcome for outbound message ${outboundMessage.id} requires reconciliation`,
        );
      }

      if (providerAcceptanceRecorded) {
        await this.prisma.outboundMessage
          .update({
            where: { id: outboundMessage.id },
            data: {
              lastError:
                error instanceof Error
                  ? `Provider accepted; local finalization failed: ${error.message}`
                  : 'Provider accepted; local finalization failed',
            },
          })
          .catch(() => undefined);
        throw error;
      }

      if (error instanceof PermanentJobError) {
        const failedMessage = await this.prisma.outboundMessage.update({
          where: { id: outboundMessage.id },
          data: {
            status: OutboundMessageStatus.FAILED,
            retryCount: { increment: 1 },
            processingStartedAt: null,
            lastError: error.message,
          },
        });
        await this.publishOutboundMessageUpdated(
          failedMessage.id,
          failedMessage.conversationId,
          failedMessage.status,
        );
        throw error;
      }

      const attempts = Number(job.opts.attempts ?? 1);
      const finalAttempt = job.attemptsMade + 1 >= attempts;
      const failedMessage = await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: finalAttempt
            ? OutboundMessageStatus.FAILED
            : OutboundMessageStatus.RETRYING,
          retryCount: { increment: 1 },
          processingStartedAt: null,
          lastError:
            error instanceof Error
              ? error.message
              : 'Outbound processing failed',
        },
      });
      await this.publishOutboundMessageUpdated(
        failedMessage.id,
        failedMessage.conversationId,
        failedMessage.status,
      );
      throw error;
    }
  }

  private async finalizeSentMessage(outboundMessageId: string) {
    return this.prisma.$transaction(async (tx) => {
      const outboundMessage = await tx.outboundMessage.findUniqueOrThrow({
        where: { id: outboundMessageId },
        include: { conversation: true },
      });

      if (!outboundMessage.externalMessageId || !outboundMessage.sentAt) {
        throw new Error(
          `Provider acknowledgement is missing for outbound message ${outboundMessageId}`,
        );
      }

      const pendingAttachments = await tx.attachment.findMany({
        where: {
          storageKey: { startsWith: `pending:${outboundMessageId}:` },
        },
      });
      const contentType =
        pendingAttachments.length > 0
          ? MessageContentType.ATTACHMENT
          : MessageContentType.TEXT;

      const timelineMessage = await tx.message.upsert({
        where: {
          conversationId_externalMessageId: {
            conversationId: outboundMessage.conversationId,
            externalMessageId: outboundMessage.externalMessageId,
          },
        },
        update: {
          deliveryStatus: MessageDeliveryStatus.SENT,
          sentAt: outboundMessage.sentAt,
        },
        create: {
          conversationId: outboundMessage.conversationId,
          direction: MessageDirection.OUTBOUND,
          senderType: MessageSenderType.AGENT,
          senderId: outboundMessage.createdBy,
          content: outboundMessage.content,
          contentType,
          externalMessageId: outboundMessage.externalMessageId,
          replyToMessageId: outboundMessage.replyToMessageId,
          deliveryStatus: MessageDeliveryStatus.SENT,
          sentAt: outboundMessage.sentAt,
          createdAt: outboundMessage.sentAt,
        },
      });

      await tx.conversation.update({
        where: { id: outboundMessage.conversationId },
        data: {
          lastMessageAt: outboundMessage.sentAt,
          status:
            outboundMessage.conversation.status === ConversationStatus.NEW
              ? ConversationStatus.IN_PROGRESS
              : undefined,
          firstResponseAt:
            outboundMessage.conversation.firstResponseAt ??
            outboundMessage.sentAt,
        },
      });

      for (const attachment of pendingAttachments) {
        const realKey = attachment.storageKey.split(':').slice(2).join(':');
        await tx.attachment.update({
          where: { id: attachment.id },
          data: { messageId: timelineMessage.id, storageKey: realKey },
        });
      }

      return tx.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENT,
          processingStartedAt: null,
          lastError: null,
        },
      });
    });
  }

  private async publishSentEvents(sentMessage: {
    id: string;
    conversationId: string;
    status: OutboundMessageStatus;
  }) {
    await this.publishOutboundMessageUpdated(
      sentMessage.id,
      sentMessage.conversationId,
      sentMessage.status,
    );
    await this.realtimeEventsPublisher.publish(
      {
        type: REALTIME_EVENT_TYPES.CONVERSATION_UPDATED,
        conversationId: sentMessage.conversationId,
        occurredAt: new Date().toISOString(),
      },
      [
        this.realtimeEventsPublisher.conversationRoom(
          sentMessage.conversationId,
        ),
      ],
    );
  }

  private async publishOutboundMessageUpdated(
    outboundMessageId: string,
    conversationId: string,
    status: OutboundMessageStatus,
  ) {
    await this.realtimeEventsPublisher.publish(
      {
        type: REALTIME_EVENT_TYPES.OUTBOUND_MESSAGE_UPDATED,
        outboundMessageId,
        conversationId,
        status,
        occurredAt: new Date().toISOString(),
      },
      [this.realtimeEventsPublisher.conversationRoom(conversationId)],
    );
  }
}
