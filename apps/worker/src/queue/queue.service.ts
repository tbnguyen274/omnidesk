import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAMES, QueueName } from '@omnidesk/shared';

type RedisConnectionOptions = {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
};

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: Redis | null = null;
  private connectionOptions: RedisConnectionOptions | null = null;
  private readonly queues = new Map<QueueName, Queue>();

  async onModuleInit() {
    this.connectionOptions = {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    };

    this.connection = new Redis(this.connectionOptions);

    await this.connection.ping();

    for (const queueName of Object.values(QUEUE_NAMES)) {
      this.queues.set(
        queueName,
        new Queue(queueName, {
          connection: this.connectionOptions,
        }),
      );
    }

    this.logger.log(
      `Connected to Redis and registered queues: ${this.getQueueNames().join(', ')}`,
    );
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection?.quit();
  }

  getQueueNames() {
    return [...this.queues.keys()];
  }

  async ping() {
    if (!this.connection) {
      throw new Error('Redis connection is not initialized');
    }

    return this.connection.ping();
  }
}
