import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { InboundEventJobPayload } from '@omnidesk/shared';
import { InboundAdapterRegistry } from '../inbound/adapters/inbound-adapter.registry';
import { InboundEventRepository } from '../inbound/ingestion/inbound-event.repository';
import { InboundIngestionService } from '../inbound/ingestion/inbound-ingestion.service';
import { InboundNotificationsService } from '../inbound/ingestion/inbound-notifications.service';
import { InboundLeaseLostError } from '../inbound/inbound.types';
import type { IngestionResult } from '../inbound/inbound.types';

@Injectable()
export class InboundEventsProcessor {
  private readonly logger = new Logger(InboundEventsProcessor.name);
  constructor(
    private readonly events: InboundEventRepository,
    private readonly adapters: InboundAdapterRegistry,
    private readonly ingestion: InboundIngestionService,
    private readonly notifications: InboundNotificationsService,
  ) {}

  async process(job: Job<InboundEventJobPayload>) {
    const claim = await this.events.claim(job.data.inboundEventId);
    if (!claim) {
      this.logger.log(
        JSON.stringify({
          action: 'inbound_claim_skipped',
          inboundEventId: job.data.inboundEventId,
          jobId: job.id,
        }),
      );
      return;
    }
    let result: IngestionResult;
    try {
      const adapter = this.adapters.find(claim.event);
      if (!adapter) {
        this.logger.warn(
          `Unsupported inbound provider/event: ${claim.event.provider}/${claim.event.eventType}; completing no-op ${claim.event.id}`,
        );
        await this.events.completeNoop(claim);
        return;
      }
      const normalized = await adapter.normalize(claim.event);
      result = await this.ingestion.ingest(claim, normalized);
    } catch (error) {
      if (error instanceof InboundLeaseLostError) {
        this.logger.warn(
          JSON.stringify({
            action: 'inbound_lease_lost',
            inboundEventId: claim.event.id,
          }),
        );
        // A reconciler may have reset this event to PENDING without creating a
        // new job. Let BullMQ retry; do not acknowledge that unfinished work.
        throw error;
      }
      try {
        await this.events.fail(claim, error);
      } catch {
        this.logger.error(
          `Could not record inbound failure: ${claim.event.id}`,
        );
      }
      throw error;
    }
    this.logger.log(
      JSON.stringify({
        action: result.duplicated
          ? 'inbound_duplicate_skipped'
          : 'inbound_ingested',
        inboundEventId: claim.event.id,
        conversationId: result.conversationId,
        jobId: job.id,
      }),
    );
    // Intentionally outside the domain failure handler: a committed event stays PROCESSED.
    await this.notifications.publish(result);
  }
}
