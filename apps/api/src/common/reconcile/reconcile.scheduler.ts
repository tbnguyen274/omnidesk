import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InboundEventStatus, OutboundMessageStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const INBOUND_LEASE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const OUTBOUND_STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * ReconcileScheduler runs periodically to detect and recover stuck jobs:
 *
 * - InboundEvents stuck in PROCESSING beyond the lease timeout are reset to
 *   PENDING so the outbox dispatcher or a BullMQ retry can pick them up again.
 *
 * - OutboundMessages stuck in PENDING/SENDING/RETRYING beyond the threshold
 *   are logged as warnings so operators can investigate.
 */
@Injectable()
export class ReconcileScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconcileScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private reconcileInProgress = false;

  constructor(private readonly prisma: PrismaService) {}

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
      await this.warnStuckOutboundMessages();
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

  private async warnStuckOutboundMessages() {
    const stuckCutoff = new Date(Date.now() - OUTBOUND_STUCK_THRESHOLD_MS);

    const stuck = await this.prisma.outboundMessage.findMany({
      where: {
        status: {
          in: [
            OutboundMessageStatus.PENDING,
            OutboundMessageStatus.SENDING,
            OutboundMessageStatus.RETRYING,
          ],
        },
        createdAt: { lt: stuckCutoff },
      },
      select: { id: true, status: true, provider: true, createdAt: true },
      take: 100,
    });

    if (stuck.length > 0) {
      this.logger.warn(
        `Reconciler detected ${stuck.length} stuck outbound messages (PENDING/SENDING/RETRYING > ${OUTBOUND_STUCK_THRESHOLD_MS / 60_000}min): ` +
          stuck.map((m) => m.id).join(', '),
      );
    }
  }
}
