import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QueueName, QueuePayloadByName } from '@omnidesk/shared';

type RedisConnectionOptions = {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
};

@Injectable()
export class QueuesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueuesService.name);
  private connectionOptions: RedisConnectionOptions | null = null;
  private readonly queues = new Map<QueueName, Queue>();

  onModuleInit() {
    this.connectionOptions = {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    };

    for (const queueName of Object.values(QUEUE_NAMES)) {
      this.queues.set(
        queueName,
        new Queue(queueName, {
          connection: this.connectionOptions,
        }),
      );
    }

    this.logger.log(
      `Registered API queues: ${this.getQueueNames().join(', ')}`,
    );
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  getQueueNames() {
    return [...this.queues.keys()];
  }

  async add<TQueueName extends QueueName>(
    queueName: TQueueName,
    jobName: string,
    payload: QueuePayloadByName[TQueueName],
  ) {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue ${queueName} is not registered`);
    }

    const job = await queue.add(jobName, payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 60 * 60,
        count: 1000,
      },
      removeOnFail: {
        age: 24 * 60 * 60,
      },
    });

    this.logger.log(
      [
        'enqueue',
        `queue=${queueName}`,
        `jobName=${jobName}`,
        `jobId=${job.id ?? 'unknown'}`,
        `payload=${JSON.stringify(this.getObservablePayload(payload))}`,
      ].join(' '),
    );

    return job;
  }

  /**
   * Enqueues a job with a deterministic jobId for deduplication.
   * Used by the outbox dispatcher to prevent duplicate jobs when the
   * dispatcher runs multiple times before Redis processes the first enqueue.
   */
  async addWithJobId<TQueueName extends QueueName>(
    queueName: TQueueName,
    jobName: string,
    payload: QueuePayloadByName[TQueueName],
    jobId: string,
  ) {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue ${queueName} is not registered`);
    }

    const job = await queue.add(jobName, payload, {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 60 * 60,
        count: 1000,
      },
      removeOnFail: false,
    });

    this.logger.log(
      [
        'enqueue_with_id',
        `queue=${queueName}`,
        `jobName=${jobName}`,
        `jobId=${jobId}`,
      ].join(' '),
    );

    return job;
  }

  /**
   * Returns failed jobs from a queue for dead-letter inspection.
   */
  async getFailedJobs(queueName: QueueName, limit = 50) {
    const queue = this.queues.get(queueName);
    if (!queue) return [];

    const jobs = await queue.getFailed(0, limit - 1);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  }

  /**
   * Retries a failed job by moving it back to the waiting state.
   */
  async retryJob(queueName: QueueName, jobId: string) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} is not registered`);

    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found in queue ${queueName}`);

    await job.retry('failed');
    return { retried: true, jobId };
  }

  private getObservablePayload(payload: Record<string, unknown>) {
    const keys = [
      'inboundEventId',
      'outboundMessageId',
      'conversationId',
      'channelAccountId',
      'syncLogId',
      'messageId',
      'provider',
      'eventType',
      'action',
      'requestedBy',
    ];

    return Object.fromEntries(
      keys
        .filter((key) => payload[key] !== undefined)
        .map((key) => [key, payload[key]]),
    );
  }
}

