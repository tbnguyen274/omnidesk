import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class AutoCloseScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoCloseScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private tickInProgress = false;

  constructor(private readonly queueService: QueueService) {}

  onModuleInit() {
    const intervalMs = 60 * 60 * 1000; // Check auto-close every 1 hour

    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();

    setTimeout(() => void this.tick(), 10000).unref?.();
    this.logger.log(`Auto close scheduler started every ${intervalMs}ms`);
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
        QUEUE_NAMES.AUTO_CLOSE,
        'auto-close',
        {
          requestedAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to dispatch auto-close job', error);
    } finally {
      this.tickInProgress = false;
    }
  }
}
