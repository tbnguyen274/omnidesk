import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { QueueService } from '../queue/queue.service';

const SCHEDULER_KEY = 'auto-close-repeatable';
const INTERVAL_MS = 60 * 60 * 1000; // every 1 hour

/**
 * Registers a BullMQ repeatable job for auto-close instead of using setInterval.
 * Using repeatable jobs is safe when multiple worker instances are running —
 * BullMQ guarantees only one scheduler entry exists per key.
 */
@Injectable()
export class AutoCloseScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AutoCloseScheduler.name);

  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap() {
    await this.queueService.upsertRepeatable(
      QUEUE_NAMES.AUTO_CLOSE,
      'auto-close',
      { requestedAt: new Date().toISOString() },
      { every: INTERVAL_MS, jobId: SCHEDULER_KEY },
    );

    this.logger.log(
      `Auto-close scheduler registered (repeatable every ${INTERVAL_MS}ms)`,
    );
  }

  async onModuleDestroy() {
    await this.queueService.removeRepeatable(
      QUEUE_NAMES.AUTO_CLOSE,
      SCHEDULER_KEY,
    );
  }
}
