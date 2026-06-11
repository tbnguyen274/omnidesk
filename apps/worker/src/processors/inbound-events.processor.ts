import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InboundEventJobPayload } from '@omnidesk/shared';
import {
  InboundEventStatus,
  InboundEventType,
  InboundProvider,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EmailInboundService } from '../email/email-inbound.service';
import { FacebookInboundService } from '../facebook/services/facebook-inbound.service';

@Injectable()
export class InboundEventsProcessor {
  private readonly logger = new Logger(InboundEventsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailInbound: EmailInboundService,
    private readonly facebookInbound: FacebookInboundService,
  ) {}

  async process(job: Job<InboundEventJobPayload>) {
    const inboundEvent = await this.prisma.inboundEvent.findUnique({
      where: { id: job.data.inboundEventId },
    });

    if (!inboundEvent) {
      this.logger.warn(`Inbound event ${job.data.inboundEventId} not found`);
      return;
    }

    try {
      if (
        inboundEvent.provider === InboundProvider.EMAIL &&
        inboundEvent.eventType === InboundEventType.EMAIL_RECEIVED
      ) {
        await this.emailInbound.process(inboundEvent);
        return;
      }

      if (
        inboundEvent.provider === InboundProvider.FACEBOOK &&
        (inboundEvent.eventType === InboundEventType.MESSAGE ||
          inboundEvent.eventType === InboundEventType.COMMENT)
      ) {
        await this.facebookInbound.process(inboundEvent);
        return;
      }

      await this.prisma.inboundEvent.update({
        where: { id: inboundEvent.id },
        data: {
          normalizedStatus: InboundEventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      await this.prisma.inboundEvent.update({
        where: { id: inboundEvent.id },
        data: {
          normalizedStatus: InboundEventStatus.FAILED,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Inbound processing failed',
        },
      });
      throw error;
    }
  }
}
