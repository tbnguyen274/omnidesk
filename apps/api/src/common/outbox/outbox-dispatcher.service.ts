import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ConversationOutboxPayload,
  EmailActionsJobPayload,
  InboundEventJobPayload,
  QUEUE_NAMES,
} from '@omnidesk/shared';
import { ConversationStatus, Priority } from '@prisma/client';
import { QueuesService } from '../queues/queues.service';
import { OutboxService } from './outbox.service';

const DISPATCH_INTERVAL_MS = 2_000; // 2 seconds safety net
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour periodic cleanup
const MAX_ATTEMPTS = 5;

/**
 * OutboxDispatcherService dispatches PENDING outbox_events to BullMQ.
 *
 * Implements a Hybrid Fast-Path architecture:
 * 1. Fast-path: Triggered immediately (<5ms) after DB transactions via `trigger()`.
 * 2. Safety-net: Periodically polls every 2 seconds to catch any unhandled/retry events.
 * 3. Background cleanup: Periodically purges 7-day-old published events every hour.
 *
 * Uses deterministic job IDs (`outbox_<outboxEventId>`) to prevent duplicate execution.
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private dispatchInProgress = false;
  private hasPendingTrigger = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly queues: QueuesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.dispatch(), DISPATCH_INTERVAL_MS);
    this.timer.unref?.();

    this.cleanupTimer = setInterval(
      () => void this.runCleanup(),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref?.();

    this.logger.log(
      `Outbox dispatcher started (safety net: ${DISPATCH_INTERVAL_MS}ms, cleanup: ${CLEANUP_INTERVAL_MS / 60000}m)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Triggers an immediate, non-blocking dispatch pass on the next event loop tick.
   * If a dispatch pass is currently in progress, sets hasPendingTrigger so the loop
   * continues immediately without waiting for the timer.
   */
  trigger(): void {
    if (this.dispatchInProgress) {
      this.hasPendingTrigger = true;
      return;
    }

    setImmediate(() => {
      void this.dispatch();
    });
  }

  /**
   * Runs periodic cleanup of old published outbox events (retained for 7 days).
   */
  async runCleanup(retentionDays = 7) {
    try {
      const deleted = await this.outbox.cleanup(retentionDays);
      if (deleted.count > 0) {
        this.logger.log(`Cleaned up ${deleted.count} published outbox events`);
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup outbox events: ${error}`);
    }
  }

  async dispatch() {
    if (this.dispatchInProgress) return;
    this.dispatchInProgress = true;

    try {
      do {
        this.hasPendingTrigger = false;
        const events = await this.outbox.findPending(100);
        if (events.length === 0) break;

        for (const event of events) {
          try {
            const jobId = `outbox_${event.id}`;
            const payload = event.payload as Record<string, unknown>;

            if (event.type === 'INBOUND_EVENT_CREATED') {
              const job = await this.queues.addWithJobId(
                QUEUE_NAMES.INBOUND_EVENTS,
                'process-inbound-event',
                payload as InboundEventJobPayload,
                jobId,
              );
              await this.outbox.markPublished(event.id, job?.id ?? jobId);
              this.logger.log(
                `Dispatched outbox event ${event.id} (type=${event.type}) => job ${job?.id ?? jobId}`,
              );
            } else if (
              event.type === 'CONVERSATION_STATUS_CHANGED' ||
              event.type === 'CONVERSATION_PRIORITY_CHANGED' ||
              event.type === 'CONVERSATION_READ_STATUS_CHANGED'
            ) {
              const p = payload as unknown as ConversationOutboxPayload;
              let action: EmailActionsJobPayload['action'] | null = null;

              if (
                p.channelType === 'EMAIL' &&
                p.externalMessageId &&
                p.channelAccountId
              ) {
                switch (event.type) {
                  case 'CONVERSATION_STATUS_CHANGED':
                    if (p.newStatus === ConversationStatus.CLOSED) {
                      action = 'MOVE_TO_ARCHIVE';
                    }
                    break;
                  case 'CONVERSATION_PRIORITY_CHANGED':
                    action =
                      p.newPriority === Priority.HIGH ||
                      p.newPriority === Priority.URGENT
                        ? 'MARK_STARRED'
                        : 'UNMARK_STARRED';
                    break;
                  case 'CONVERSATION_READ_STATUS_CHANGED':
                    action = p.isRead ? 'MARK_READ' : 'MARK_UNREAD';
                    break;
                }
              }

              if (action) {
                const queuePayload: EmailActionsJobPayload = {
                  action,
                  messageId: p.externalMessageId!,
                  channelAccountId: p.channelAccountId!,
                };
                const job = await this.queues.addWithJobId(
                  QUEUE_NAMES.EMAIL_ACTIONS,
                  'email-channel-action',
                  queuePayload,
                  jobId,
                );
                await this.outbox.markPublished(event.id, job?.id ?? jobId);
                this.logger.log(
                  `Dispatched outbox event ${event.id} (action=${action}) → job ${job?.id ?? jobId}`,
                );
              } else {
                // No-op Consumed Handling: Event is valid but requires no downstream IMAP action
                // (e.g. non-EMAIL channel or status transition like RESOLVED). Mark published immediately
                // so it does not linger in PENDING.
                await this.outbox.markPublished(event.id, 'no_action_required');
                this.logger.log(
                  `Outbox event ${event.id} (type=${event.type}) consumed as no_action_required`,
                );
              }
            } else {
              this.logger.warn(`Unknown outbox event type: ${event.type}`);
              await this.outbox.markFailed(
                event.id,
                `Unknown event type: ${event.type}`,
              );
            }
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
      } while (this.hasPendingTrigger);
    } finally {
      this.dispatchInProgress = false;
    }
  }
}
