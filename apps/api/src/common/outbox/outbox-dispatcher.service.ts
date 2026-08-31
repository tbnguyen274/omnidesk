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

          if (event.type === 'INBOUND_EVENT_CREATED') {
            const job = await this.queues.addWithJobId(
              QUEUE_NAMES.INBOUND_EVENTS,
              'process-inbound-event',
              payload as InboundEventJobPayload,
              jobId,
            );
            await this.outbox.markPublished(event.id, job?.id ?? jobId);
            this.logger.log(
              `Dispatched outbox event ${event.id} (type=${event.type}) → job ${job?.id ?? jobId}`,
            );
          } else if (
            event.type === 'CONVERSATION_STATUS_CHANGED' ||
            event.type === 'CONVERSATION_PRIORITY_CHANGED' ||
            event.type === 'CONVERSATION_READ_STATUS_CHANGED'
          ) {
            const p = payload as unknown as ConversationOutboxPayload;
            let action: EmailActionsJobPayload['action'] | null = null;

            if (p.channelType === 'EMAIL' && p.externalMessageId && p.channelAccountId) {
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
