import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OutboundMessageJobPayload } from '@omnidesk/shared';
import { OutboundMessageStatus, OutboundProvider } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EmailOutboundService } from '../email/email-outbound.service';

@Injectable()
export class OutboundMessagesProcessor {
  private readonly logger = new Logger(OutboundMessagesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailOutbound: EmailOutboundService,
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
      await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENDING,
          lastError: null,
        },
      });

      if (outboundMessage.content.toLowerCase().includes('mock_fail')) {
        throw new Error('Mock outbound provider failure');
      }

      await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENT,
          externalMessageId: `mock_${outboundMessage.id}`,
          sentAt: new Date(),
          lastError: null,
        },
      });

      if (outboundMessage.provider === OutboundProvider.EMAIL) {
        await this.emailOutbound.createTimelineMessage(outboundMessage.id);
      }
    } catch (error) {
      const attempts = Number(job.opts.attempts ?? 1);
      const finalAttempt = job.attemptsMade + 1 >= attempts;

      await this.prisma.outboundMessage.update({
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

      throw error;
    }
  }
}
