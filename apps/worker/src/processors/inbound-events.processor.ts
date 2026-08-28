import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InboundEventJobPayload } from '@omnidesk/shared';
import { InboundEventStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { InboundAdapterRegistry } from '../inbound/adapters/inbound-adapter.registry';
import { PermanentJobError } from '../errors/permanent-job.error';

/** Lease duration: if processing has been in-flight for longer than this, it is
 *  considered stale and the reconcile scheduler will reset it back to PENDING. */
const PROCESSING_LEASE_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class InboundEventsProcessor {
  private readonly logger = new Logger(InboundEventsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundAdapters: InboundAdapterRegistry,
  ) {}

  async process(job: Job<InboundEventJobPayload>) {
    // --- Idempotency: atomic PENDING → PROCESSING transition ---
    const now = new Date();

    const acquired = await this.prisma.inboundEvent.updateMany({
      where: {
        id: job.data.inboundEventId,
        normalizedStatus: InboundEventStatus.PENDING,
      },
      data: {
        normalizedStatus: InboundEventStatus.PROCESSING,
        processingStartedAt: now,
      },
    });

    if (acquired.count === 0) {
      // Either already PROCESSING (another worker), PROCESSED, or FAILED (terminal) — skip.
      const event = await this.prisma.inboundEvent.findUnique({
        where: { id: job.data.inboundEventId },
        select: { normalizedStatus: true },
      });

      if (!event) {
        this.logger.warn(`Inbound event ${job.data.inboundEventId} not found`);
        return;
      }

      if (event.normalizedStatus === InboundEventStatus.PROCESSED) {
        this.logger.log(
          `Inbound event ${job.data.inboundEventId} already PROCESSED — skipping`,
        );
        return;
      }

      if (event.normalizedStatus === InboundEventStatus.PROCESSING) {
        // Check if lease is still valid
        const staleEvent = await this.prisma.inboundEvent.findFirst({
          where: {
            id: job.data.inboundEventId,
            processingStartedAt: {
              lt: new Date(Date.now() - PROCESSING_LEASE_MS),
            },
          },
          select: { id: true },
        });

        if (!staleEvent) {
          this.logger.warn(
            `Inbound event ${job.data.inboundEventId} is already PROCESSING (lease valid) — skipping`,
          );
          return;
        }

        // Stale lease: take over by resetting to PROCESSING with new lease
        await this.prisma.inboundEvent.update({
          where: { id: job.data.inboundEventId },
          data: { processingStartedAt: now },
        });

        this.logger.warn(
          `Inbound event ${job.data.inboundEventId} had a stale lease — reclaiming`,
        );
      }
    }

    // --- Load the event and process ---
    const inboundEvent = await this.prisma.inboundEvent.findUnique({
      where: { id: job.data.inboundEventId },
    });

    if (!inboundEvent) {
      throw new PermanentJobError(
        `Inbound event ${job.data.inboundEventId} not found — record may have been deleted`,
      );
    }

    try {
      const adapter = this.inboundAdapters.find(inboundEvent);

      if (adapter) {
        await adapter.process(inboundEvent);
        return;
      }

      // No adapter found for this provider + eventType combination — treat as no-op.
      this.logger.warn(
        `No inbound adapter found for provider=${inboundEvent.provider} eventType=${inboundEvent.eventType} — marking as processed (no-op)`,
      );
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
