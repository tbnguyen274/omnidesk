import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  OutboundMessageJobPayload,
  REALTIME_EVENT_TYPES,
} from '@omnidesk/shared';
import { OutboundMessageStatus, OutboundProvider } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EmailOutboundService } from '../email/email-outbound.service';
import { FacebookOutboundService } from '../facebook/services/facebook-outbound.service';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';

@Injectable()
export class OutboundMessagesProcessor {
  private readonly logger = new Logger(OutboundMessagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailOutbound: EmailOutboundService,
    private readonly facebookOutbound: FacebookOutboundService,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async process(job: Job<OutboundMessageJobPayload>) {
    const outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: job.data.outboundMessageId },
    });

    if (!outboundMessage) {
      this.logger.warn(
        `Outbound message ${job.data.outboundMessageId} not found`,
      );
      return;
    }

    try {
      const sendingMessage = await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENDING,
          lastError: null,
        },
      });
      await this.publishOutboundMessageUpdated(
        sendingMessage.id,
        sendingMessage.conversationId,
        sendingMessage.status,
      );

      if (outboundMessage.content.toLowerCase().includes('mock_fail')) {
        throw new Error('Mock outbound provider failure');
      }

      let sentAt = new Date();
      let externalMessageId = `mock_${outboundMessage.id}`;

      if (outboundMessage.provider === OutboundProvider.EMAIL) {
        const sentEmail = await this.emailOutbound.sendOutboundMessage(
          outboundMessage.id,
        );
        externalMessageId = sentEmail.externalMessageId;
        sentAt = sentEmail.sentAt;
      }

      const sentMessage = await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENT,
          externalMessageId,
          sentAt,
          lastError: null,
        },
      });
      await this.publishOutboundMessageUpdated(
        sentMessage.id,
        sentMessage.conversationId,
        sentMessage.status,
      );

      if (outboundMessage.provider === OutboundProvider.EMAIL) {
        await this.emailOutbound.createTimelineMessage(outboundMessage.id);
      }

      if (outboundMessage.provider === OutboundProvider.FACEBOOK) {
        await this.facebookOutbound.createTimelineMessage(outboundMessage.id);
      }
    } catch (error) {
      const attempts = Number(job.opts.attempts ?? 1);
      const finalAttempt = job.attemptsMade + 1 >= attempts;

      const failedMessage = await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: finalAttempt
            ? OutboundMessageStatus.FAILED
            : OutboundMessageStatus.RETRYING,
          retryCount: { increment: 1 },
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
        status: status,
        occurredAt: new Date().toISOString(),
      },
      [this.realtimeEventsPublisher.conversationRoom(conversationId)],
    );
  }
}
