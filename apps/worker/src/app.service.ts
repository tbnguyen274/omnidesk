import { Injectable } from '@nestjs/common';
import { QueueService } from './queue/queue.service';

@Injectable()
export class AppService {
  constructor(private readonly queueService: QueueService) {}

  async getHealth() {
    const redis = await this.queueService.ping();

    return {
      success: redis === 'PONG',
      data: {
        service: 'worker',
        status: redis === 'PONG' ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        checks: {
          redis: {
            status: redis === 'PONG' ? 'ok' : 'error',
          },
          queues: this.queueService.getQueueNames(),
        },
      },
    };
  }
}
