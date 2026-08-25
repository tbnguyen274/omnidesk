import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  OutboundMessageJobPayload,
  REALTIME_EVENT_TYPES,
} from '@omnidesk/shared';
import { OutboundMessageStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OutboundAdapterRegistry } from '../outbound/adapters/outbound-adapter.registry';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';
import { PermanentJobError } from '../errors/permanent-job.error';

@Injectable()
export class OutboundMessagesProcessor {
  private readonly logger = new Logger(OutboundMessagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundAdapters: OutboundAdapterRegistry,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async process(job: Job<OutboundMessageJobPayload>) {
    const outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: job.data.outboundMessageId },
    });

    if (!outboundMessage) {
      throw new PermanentJobError(
        `Outbound message ${job.data.outboundMessageId} not found — record may have been deleted`,
      );
    }

    // Idempotency guard: skip if already in a terminal state (e.g. worker crashed after send)
    if (
      outboundMessage.status === OutboundMessageStatus.SENT ||
      outboundMessage.status === OutboundMessageStatus.FAILED
    ) {
      this.logger.log(
        `Outbound message ${outboundMessage.id} already in terminal state ${outboundMessage.status} — skipping`,
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

      const outboundAdapter = this.outboundAdapters.get(
        outboundMessage.provider,
      );
      const { externalMessageId, sentAt } = await outboundAdapter.send(
        outboundMessage.id,
      );

      const sentMessage = await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENT,
          externalMessageId,
          sentAt,
          lastError: null,
        },
      });

      await outboundAdapter.createTimelineMessage(outboundMessage.id);

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
