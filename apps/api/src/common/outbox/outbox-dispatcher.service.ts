import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { QueuesService } from '../queues/queues.service';
import { OutboxService } from './outbox.service';

const DISPATCH_INTERVAL_MS = 30_000; // 30 seconds
const MAX_ATTEMPTS = 5;

/**
 * OutboxDispatcherService periodically polls the outbox_events table for
 * PENDING events and enqueues them into BullMQ using a deterministic jobId
 * (outbox:<outboxEventId>) to prevent duplicates.
 *
 * This decouples event dispatch from the HTTP request lifecycle so events
 * are not lost if Redis is temporarily unavailable when the webhook arrives.
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private dispatchInProgress = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly queues: QueuesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.dispatch(), DISPATCH_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(
      `Outbox dispatcher started (interval: ${DISPATCH_INTERVAL_MS}ms)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async dispatch() {
    if (this.dispatchInProgress) return;
    this.dispatchInProgress = true;

    try {
      const events = await this.outbox.findPending(100);

      for (const event of events) {
        try {
          const jobId = `outbox:${event.id}`;
          const payload = event.payload as Record<string, unknown>;

          let job: { id?: string } | null = null;

          if (event.type === 'INBOUND_EVENT_CREATED') {
            job = await this.queues.addWithJobId(
              QUEUE_NAMES.INBOUND_EVENTS,
              'process-inbound-event',
              payload as import('@omnidesk/shared').InboundEventJobPayload,
              jobId,
            );
          } else {
            this.logger.warn(`Unknown outbox event type: ${event.type}`);
            await this.outbox.markFailed(
              event.id,
              `Unknown event type: ${event.type}`,
            );
            continue;
          }

          await this.outbox.markPublished(event.id, job?.id ?? jobId);
          this.logger.log(
            `Dispatched outbox event ${event.id} (type=${event.type}) → job ${job?.id ?? jobId}`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Dispatch failed';

          this.logger.error(
            `Failed to dispatch outbox event ${event.id}: ${message}`,
          );

          if (event.attempts + 1 >= MAX_ATTEMPTS) {
            await this.outbox.markFailed(event.id, message);
            this.logger.error(
              `Outbox event ${event.id} exceeded max attempts (${MAX_ATTEMPTS}) — marked DEAD`,
            );
          } else {
            await this.outbox.incrementAttempts(event.id, message);
          }
        }
      }

      // Cleanup old published events
      const deleted = await this.outbox.cleanup(7);
      if (deleted.count > 0) {
        this.logger.log(`Cleaned up ${deleted.count} published outbox events`);
      }
    } finally {
      this.dispatchInProgress = false;
    }
  }
}
