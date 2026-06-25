import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class SlaCheckScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaCheckScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private tickInProgress = false;

  constructor(private readonly queueService: QueueService) {}

  onModuleInit() {
    const intervalMs = 60 * 1000; // Check SLA every 1 minute

    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();

    setTimeout(() => void this.tick(), 5000).unref?.();
    this.logger.log(`SLA check scheduler started every ${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.tickInProgress) {
      return;
    }

    this.tickInProgress = true;

    try {
      await this.queueService.add(
        QUEUE_NAMES.SLA_CHECK,
        'sla-check',
        {
          requestedAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Scheduled SLA check failed',
      );
    } finally {
      this.tickInProgress = false;
    }
  }
}
