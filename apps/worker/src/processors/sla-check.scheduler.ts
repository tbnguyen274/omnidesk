import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { QueueService } from '../queue/queue.service';

const SCHEDULER_KEY = 'sla-check-repeatable';
const INTERVAL_MS = 60 * 1000; // every 1 minute

/**
 * Registers a BullMQ repeatable job for SLA checks instead of using setInterval.
 * Using repeatable jobs is safe when multiple worker instances are running —
 * BullMQ guarantees only one scheduler entry exists per key.
 */
@Injectable()
export class SlaCheckScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SlaCheckScheduler.name);

  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap() {
    await this.queueService.upsertRepeatable(
      QUEUE_NAMES.SLA_CHECK,
      'sla-check',
      { requestedAt: new Date().toISOString() },
      { every: INTERVAL_MS, jobId: SCHEDULER_KEY },
    );

    this.logger.log(
      `SLA check scheduler registered (repeatable every ${INTERVAL_MS}ms)`,
    );
  }

  async onModuleDestroy() {
    await this.queueService.removeRepeatable(
      QUEUE_NAMES.SLA_CHECK,
      SCHEDULER_KEY,
    );
  }
}
