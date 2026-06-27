import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker as BullWorker } from 'bullmq';
import Redis from 'ioredis';
import {
  EmailSyncJobPayload,
  InboundEventJobPayload,
  OutboundMessageJobPayload,
  QUEUE_NAMES,
  QueuePayloadByName,
  QueueName,
  SlaCheckJobPayload,
} from '@omnidesk/shared';
import { EmailSyncProcessor } from '../processors/email-sync.processor';
import { InboundEventsProcessor } from '../processors/inbound-events.processor';
import { OutboundMessagesProcessor } from '../processors/outbound-messages.processor';
import { SlaCheckProcessor } from '../processors/sla-check.processor';
import { AutoCloseProcessor } from '../processors/auto-close.processor';

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
  private readonly workers = new Map<QueueName, BullWorker>();

  constructor(
    private readonly inboundEventsProcessor: InboundEventsProcessor,
    private readonly outboundMessagesProcessor: OutboundMessagesProcessor,
    private readonly emailSyncProcessor: EmailSyncProcessor,
    private readonly slaCheckProcessor: SlaCheckProcessor,
    private readonly autoCloseProcessor: AutoCloseProcessor,
  ) {}

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

    this.registerWorkers();

    this.logger.log(
      `Connected to Redis and registered queues/processors: ${this.getQueueNames().join(', ')}`,
    );
  }

  async onModuleDestroy() {
    await Promise.all(
      [...this.workers.values()].map((worker) => worker.close()),
    );
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection?.quit();
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
      throw new Error(`Queue ${queueName} is not initialized`);
    }

    return queue.add(jobName, payload, {
      removeOnComplete: {
        age: 60 * 60,
        count: 1000,
      },
      removeOnFail: {
        age: 24 * 60 * 60,
      },
    });
  }

  async ping() {
    if (!this.connection) {
      throw new Error('Redis connection is not initialized');
    }

    return this.connection.ping();
  }

  private registerWorkers() {
    if (!this.connectionOptions) {
      throw new Error('Redis connection options are not initialized');
    }

    this.workers.set(
      QUEUE_NAMES.INBOUND_EVENTS,
      new BullWorker(
        QUEUE_NAMES.INBOUND_EVENTS,
        (job: Job<InboundEventJobPayload>) =>
          this.inboundEventsProcessor.process(job),
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.OUTBOUND_MESSAGES,
      new BullWorker(
        QUEUE_NAMES.OUTBOUND_MESSAGES,
        (job: Job<OutboundMessageJobPayload>) =>
          this.outboundMessagesProcessor.process(job),
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.EMAIL_SYNC,
      new BullWorker(
        QUEUE_NAMES.EMAIL_SYNC,
        (job: Job<EmailSyncJobPayload>) => this.emailSyncProcessor.process(job),
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.SLA_CHECK,
      new BullWorker(
        QUEUE_NAMES.SLA_CHECK,
        (job: Job<SlaCheckJobPayload>) => this.slaCheckProcessor.process(job),
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.ANALYTICS_AGGREGATION,
      new BullWorker(
        QUEUE_NAMES.ANALYTICS_AGGREGATION,
        (job) => {
          this.logger.log(`Analytics placeholder processed job ${job.id}`);
          return Promise.resolve();
        },
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.AUTO_CLOSE,
      new BullWorker(
        QUEUE_NAMES.AUTO_CLOSE,
        (job) => this.autoCloseProcessor.process(job),
        { connection: this.connectionOptions },
      ),
    );

    for (const [queueName, worker] of this.workers.entries()) {
      worker.on('completed', (job) => {
        this.logger.log(`${queueName} completed job ${job.id}`);
      });
      worker.on('failed', (job, error) => {
        this.logger.error(
          `${queueName} failed job ${job?.id ?? 'unknown'}: ${error.message}`,
        );
      });
    }
  }
}
