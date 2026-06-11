import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker as BullWorker } from 'bullmq';
import Redis from 'ioredis';
import {
  InboundEventJobPayload,
  OutboundMessageJobPayload,
  QUEUE_NAMES,
  QueueName,
} from '@omnidesk/shared';
import {
  InboundEventStatus,
  OutboundMessageStatus,
  PrismaClient,
} from '@prisma/client';

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
  private readonly prisma = new PrismaClient();

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
    await this.prisma.$disconnect();
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

  private registerWorkers() {
    if (!this.connectionOptions) {
      throw new Error('Redis connection options are not initialized');
    }

    this.workers.set(
      QUEUE_NAMES.INBOUND_EVENTS,
      new BullWorker(
        QUEUE_NAMES.INBOUND_EVENTS,
        (job: Job<InboundEventJobPayload>) => this.processInboundEvent(job),
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.OUTBOUND_MESSAGES,
      new BullWorker(
        QUEUE_NAMES.OUTBOUND_MESSAGES,
        (job: Job<OutboundMessageJobPayload>) =>
          this.processOutboundMessage(job),
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.EMAIL_SYNC,
      new BullWorker(
        QUEUE_NAMES.EMAIL_SYNC,
        (job) => {
          this.logger.log(`Email sync placeholder processed job ${job.id}`);
          return Promise.resolve();
        },
        { connection: this.connectionOptions },
      ),
    );

    this.workers.set(
      QUEUE_NAMES.SLA_CHECK,
      new BullWorker(
        QUEUE_NAMES.SLA_CHECK,
        (job) => {
          this.logger.log(`SLA check placeholder processed job ${job.id}`);
          return Promise.resolve();
        },
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

  private async processInboundEvent(job: Job<InboundEventJobPayload>) {
    const inboundEvent = await this.prisma.inboundEvent.findUnique({
      where: { id: job.data.inboundEventId },
    });

    if (!inboundEvent) {
      this.logger.warn(`Inbound event ${job.data.inboundEventId} not found`);
      return;
    }

    try {
      await this.prisma.inboundEvent.update({
        where: { id: inboundEvent.id },
        data: {
          normalizedStatus: InboundEventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      await this.prisma.inboundEvent.update({
        where: { id: inboundEvent.id },
        data: {
          normalizedStatus: InboundEventStatus.FAILED,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Inbound processing failed',
        },
      });
      throw error;
    }
  }

  private async processOutboundMessage(job: Job<OutboundMessageJobPayload>) {
    const outboundMessage = await this.prisma.outboundMessage.findUnique({
      where: { id: job.data.outboundMessageId },
    });

    if (!outboundMessage) {
      this.logger.warn(
        `Outbound message ${job.data.outboundMessageId} not found`,
      );
      return;
    }

    try {
      await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENDING,
          lastError: null,
        },
      });

      if (outboundMessage.content.toLowerCase().includes('mock_fail')) {
        throw new Error('Mock outbound provider failure');
      }

      await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: OutboundMessageStatus.SENT,
          externalMessageId: `mock_${outboundMessage.id}`,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const attempts = Number(job.opts.attempts ?? 1);
      const finalAttempt = job.attemptsMade + 1 >= attempts;

      await this.prisma.outboundMessage.update({
        where: { id: outboundMessage.id },
        data: {
          status: finalAttempt
            ? OutboundMessageStatus.FAILED
            : OutboundMessageStatus.RETRYING,
          retryCount: { increment: 1 },
          lastError:
            error instanceof Error
              ? error.message
              : 'Outbound processing failed',
        },
      });

      throw error;
    }
  }
}
