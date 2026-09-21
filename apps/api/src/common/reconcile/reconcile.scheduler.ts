import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InboundEventStatus, OutboundMessageStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const INBOUND_LEASE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const OUTBOUND_STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * ReconcileScheduler runs periodically to detect and recover stuck jobs:
 *
 * - InboundEvents stuck in PROCESSING beyond the lease timeout are reset to
 *   PENDING so the outbox dispatcher or a BullMQ retry can pick them up again.
 *
 * - OutboundMessages with a stale provider acknowledgement are re-enqueued
 *   for local finalization; ambiguous SENDING records are quarantined.
 */
@Injectable()
export class ReconcileScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconcileScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private reconcileInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly outboxDispatcher: OutboxDispatcherService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.reconcile(),
      RECONCILE_INTERVAL_MS,
    );
    this.timer.unref?.();
    this.logger.log(
      `Reconcile scheduler started (interval: ${RECONCILE_INTERVAL_MS}ms)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconcile() {
    if (this.reconcileInProgress) return;
    this.reconcileInProgress = true;

    try {
      await this.reconcileStuckInboundEvents();
      await this.reconcileStuckOutboundMessages();
    } finally {
      this.reconcileInProgress = false;
    }
  }

  private async reconcileStuckInboundEvents() {
    const leaseCutoff = new Date(Date.now() - INBOUND_LEASE_TIMEOUT_MS);

    const result = await this.prisma.inboundEvent.updateMany({
      where: {
        normalizedStatus: InboundEventStatus.PROCESSING,
        processingStartedAt: { lt: leaseCutoff },
      },
      data: {
        normalizedStatus: InboundEventStatus.PENDING,
        processingStartedAt: null,
        errorMessage: 'Reset by reconciler: stale processing lease',
      },
    });

    if (result.count > 0) {
      this.logger.warn(
        `Reconciler reset ${result.count} stale PROCESSING inbound events back to PENDING`,
      );
    }
  }

  private async reconcileStuckOutboundMessages() {
    const stuckCutoff = new Date(Date.now() - OUTBOUND_STUCK_THRESHOLD_MS);

    const ambiguous = await this.prisma.outboundMessage.updateMany({
      where: {
        status: OutboundMessageStatus.SENDING,
        processingStartedAt: { lt: stuckCutoff },
        externalMessageId: null,
      },
      data: {
        status: OutboundMessageStatus.DELIVERY_UNKNOWN,
        processingStartedAt: null,
        lastError:
          'Delivery outcome is unknown: processing lease expired before provider acknowledgement was persisted',
      },
    });

    if (ambiguous.count > 0) {
      this.logger.error(
        `Reconciler quarantined ${ambiguous.count} stale SENDING outbound messages as DELIVERY_UNKNOWN`,
      );
    }

    const recoverable = await this.prisma.outboundMessage.findMany({
      where: {
        OR: [
          {
            status: OutboundMessageStatus.SENDING,
            processingStartedAt: { lt: stuckCutoff },
            externalMessageId: { not: null },
            sentAt: { not: null },
          },
          {
            status: {
              in: [
                OutboundMessageStatus.PENDING,
                OutboundMessageStatus.RETRYING,
              ],
            },
            updatedAt: { lt: stuckCutoff },
          },
        ],
      },
      select: {
        id: true,
        conversationId: true,
        provider: true,
      },
      take: 100,
    });

    let scheduled = 0;
    for (const message of recoverable) {
      const created = await this.prisma.$transaction(async (tx) => {
        const pending = await tx.outboxEvent.findFirst({
          where: {
            type: 'OUTBOUND_MESSAGE_SEND_REQUESTED',
            aggregateId: message.id,
            status: 'PENDING',
          },
          select: { id: true },
        });
        if (pending) return false;

        await this.outbox.createEvent(
          tx,
          'OUTBOUND_MESSAGE_SEND_REQUESTED',
          message.id,
          {
            outboundMessageId: message.id,
            conversationId: message.conversationId,
            provider: message.provider,
          },
        );
        await tx.outboundMessage.update({
          where: { id: message.id },
          data: {
            processingStartedAt: new Date(),
            lastError: 'Recovery dispatch scheduled by reconciler',
          },
        });
        return true;
      });
      if (created) scheduled++;
    }

    if (scheduled > 0) {
      this.outboxDispatcher.trigger();
      this.logger.warn(
        `Reconciler scheduled recovery for ${scheduled} stale outbound messages`,
      );
    }
  }
}
