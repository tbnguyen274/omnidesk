import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { Queue, QueueEvents, Worker } from 'bullmq';
import type { InboundEventJobPayload } from '@omnidesk/shared';
import Redis from 'ioredis';
import { PrismaService } from '../src/database/prisma.service';
import { EmailInboundAdapter } from '../src/inbound/adapters/email-inbound.adapter';
import { FacebookInboundAdapter } from '../src/inbound/adapters/facebook-inbound.adapter';
import { InboundAdapterRegistry } from '../src/inbound/adapters/inbound-adapter.registry';
import {
  InboundEventRepository,
  PROCESSING_LEASE_MS,
} from '../src/inbound/ingestion/inbound-event.repository';
import { InboundIngestionRepository } from '../src/inbound/ingestion/inbound-ingestion.repository';
import { InboundIngestionService } from '../src/inbound/ingestion/inbound-ingestion.service';
import { InboundNotificationsService } from '../src/inbound/ingestion/inbound-notifications.service';
import { InboundEventsProcessor } from '../src/processors/inbound-events.processor';
import { InboundLeaseLostError } from '../src/inbound/inbound.types';
import type { ClaimedInboundEvent } from '../src/inbound/inbound.types';
import type { FacebookProfileService } from '../src/facebook/services/facebook-profile.service';

/** Requires explicit test URLs. Every run owns a fresh schema and Redis prefix. */
describe('inbound transactions, concurrency and BullMQ recovery (real services)', () => {
  const schema = `inbound_it_${randomUUID().replaceAll('-', '')}`;
  let schemaCreated = false;
  let admin: PrismaService;
  let prisma: PrismaService;
  let redis: Redis;
  let events: InboundEventRepository;
  let repository: InboundIngestionRepository;
  let ingestion: InboundIngestionService;
  let processor: InboundEventsProcessor;
  let email: EmailInboundAdapter;
  let registry: InboundAdapterRegistry;
  const publisher = {
    publish: jest.fn(),
    conversationRoom: (id: string) => `conversation:${id}`,
    teamInboxRoom: () => 'team:inbox',
  };

  beforeAll(async () => {
    const databaseUrl = process.env.INBOUND_TEST_DATABASE_URL;
    const redisUrl = process.env.INBOUND_TEST_REDIS_URL;
    if (!databaseUrl || !redisUrl)
      throw new Error(
        'Set INBOUND_TEST_DATABASE_URL and INBOUND_TEST_REDIS_URL explicitly; integration tests never reset the development database.',
      );
    admin = new PrismaService({ datasourceUrl: databaseUrl });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const url = new URL(databaseUrl);
    url.searchParams.set('schema', schema);
    const apiRoot = resolve(__dirname, '../../api');
    const cli = require.resolve('prisma/build/index.js', { paths: [apiRoot] });
    const migrated = spawnSync(
      process.execPath,
      [
        cli,
        'migrate',
        'deploy',
        '--config',
        resolve(apiRoot, 'prisma.config.ts'),
      ],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: url.toString() },
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    if (migrated.status !== 0)
      throw new Error(`Isolated schema migration failed: ${migrated.stderr}`);
    prisma = new PrismaService({ datasourceUrl: url.toString() });
    redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    await redis.ping();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    publisher.publish.mockReset().mockResolvedValue(undefined);
    events = new InboundEventRepository(prisma);
    repository = new InboundIngestionRepository();
    ingestion = new InboundIngestionService(prisma, repository, events);
    email = new EmailInboundAdapter();
    const facebook = new FacebookInboundAdapter({
      enrich: jest.fn(),
    } as unknown as FacebookProfileService);
    registry = new InboundAdapterRegistry([email, facebook]);
    processor = new InboundEventsProcessor(
      events,
      registry,
      ingestion,
      new InboundNotificationsService(publisher as never),
    );
  });

  afterAll(async () => {
    await redis?.quit();
    await prisma?.$disconnect();
    // schema is generated here, never supplied by the caller. No other schema is touched.
    if (schemaCreated && /^inbound_it_[a-f0-9]{32}$/.test(schema))
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  async function emailEvent(
    extra: Record<string, unknown> = {},
    key = randomUUID(),
  ) {
    return prisma.inboundEvent.create({
      data: {
        provider: 'EMAIL',
        eventType: 'EMAIL_RECEIVED',
        dedupKey: `test:${key}`,
        rawPayload: {
          mailbox: `${key}@support.test`,
          messageId: key,
          fromEmail: `${key}@customer.test`,
          fromName: 'Customer',
          subject: 'Help',
          text: 'Hello',
          receivedAt: '2026-01-01T00:00:00.000Z',
          threadId: key,
          ...extra,
        },
      },
    });
  }
  function job(eventId: string) {
    return {
      id: randomUUID(),
      data: { inboundEventId: eventId },
    } as Parameters<InboundEventsProcessor['process']>[0];
  }
  async function claim(eventId: string) {
    const acquired = await events.claim(eventId);
    if (!acquired) throw new Error('Expected a processing lease');
    return acquired;
  }
  async function normalize(acquired: ClaimedInboundEvent) {
    const adapter = registry.find(acquired.event);
    if (!adapter) throw new Error('Expected registered adapter');
    return adapter.normalize(acquired.event);
  }

  it('allows only one concurrent job to claim the same event', async () => {
    const event = await emailEvent();
    await Promise.all([
      processor.process(job(event.id)),
      processor.process(job(event.id)),
    ]);
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
    expect(
      await prisma.inboundEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({
      normalizedStatus: 'PROCESSED',
      processingStartedAt: null,
    });
  });

  it('serializes two events for the same customer/thread into one conversation and ticket', async () => {
    const key = randomUUID();
    const payload = {
      mailbox: `${key}@support.test`,
      fromEmail: `${key}@customer.test`,
      threadId: key,
    };
    const first = await emailEvent({ ...payload, messageId: 'first' });
    const second = await emailEvent({ ...payload, messageId: 'second' });
    await Promise.all([
      processor.process(job(first.id)),
      processor.process(job(second.id)),
    ]);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { email: payload.fromEmail },
    });
    const conversations = await prisma.conversation.findMany({
      where: { customerId: customer.id },
      include: { messages: true, ticket: true },
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0].messages).toHaveLength(2);
    expect(conversations[0].ticket).not.toBeNull();
  });

  it('uses compare-and-set for stale takeover and rejects old-owner writes', async () => {
    const event = await emailEvent();
    const old = await claim(event.id);
    old.leaseStartedAt = new Date(Date.now() - PROCESSING_LEASE_MS - 1000);
    await prisma.inboundEvent.update({
      where: { id: event.id },
      data: { processingStartedAt: old.leaseStartedAt },
    });
    const contenders = await Promise.all([
      events.claim(event.id),
      events.claim(event.id),
    ]);
    const winners = contenders.filter(
      (candidate): candidate is ClaimedInboundEvent => candidate !== null,
    );
    expect(winners).toHaveLength(1);
    expect((await events.fail(old, new Error('late old owner'))).count).toBe(0);
    await expect(
      ingestion.ingest(old, await normalize(old)),
    ).rejects.toBeInstanceOf(InboundLeaseLostError);
    await ingestion.ingest(winners[0], await normalize(winners[0]));
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
  });

  it('rejects an owner after the API reconciler resets its lease', async () => {
    const event = await emailEvent();
    const old = await claim(event.id);
    await prisma.inboundEvent.update({
      where: { id: event.id },
      data: { normalizedStatus: 'PENDING', processingStartedAt: null },
    });
    await expect(
      ingestion.ingest(old, await normalize(old)),
    ).rejects.toBeInstanceOf(InboundLeaseLostError);
    await processor.process(job(event.id));
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
  });

  it('does not reapply lifecycle, version, attachments or SLA during replay', async () => {
    const key = randomUUID();
    const payload = {
      mailbox: `${key}@support.test`,
      fromEmail: `${key}@customer.test`,
      threadId: key,
      messageId: key,
      attachments: [
        {
          key: 'lazy:imap:account:message:0:file.pdf',
          url: '/file',
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      ],
    };
    const event = await emailEvent(payload);
    await processor.process(job(event.id));
    const message = await prisma.message.findFirstOrThrow({
      where: { inboundEventId: event.id },
    });
    const before = await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
      include: { ticket: true },
    });
    await prisma.inboundEvent.update({
      where: { id: event.id },
      data: { normalizedStatus: 'FAILED' },
    });
    await processor.process(job(event.id));
    const duplicateEvent = await emailEvent(payload);
    await processor.process(job(duplicateEvent.id));
    expect(
      await prisma.conversation.findUniqueOrThrow({
        where: { id: before.id },
        include: { ticket: true },
      }),
    ).toEqual(before);
    expect(
      await prisma.message.count({ where: { conversationId: before.id } }),
    ).toBe(1);
    expect(
      await prisma.attachment.count({ where: { messageId: message.id } }),
    ).toBe(1);
    expect(
      await prisma.inboundEvent.findUniqueOrThrow({
        where: { id: duplicateEvent.id },
      }),
    ).toMatchObject({ normalizedStatus: 'PROCESSED' });
  });

  it('rolls back partial domain writes and retries successfully', async () => {
    const event = await emailEvent();
    const broken = jest
      .spyOn(repository, 'createTicket')
      .mockRejectedValueOnce(new Error('temporary ticket failure'));
    await expect(processor.process(job(event.id))).rejects.toThrow(
      'temporary ticket failure',
    );
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(0);
    expect(
      await prisma.conversation.count({
        where: {
          externalConversationId: (await email.normalize(event))
            .externalConversationId,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.inboundEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({ normalizedStatus: 'FAILED', processingStartedAt: null });
    expect(publisher.publish).not.toHaveBeenCalled();
    broken.mockRestore();
    await processor.process(job(event.id));
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
  });

  it('keeps PROCESSED and committed data when every notification fails', async () => {
    publisher.publish.mockRejectedValue(new Error('Redis publish failed'));
    const event = await emailEvent();
    await processor.process(job(event.id));
    await processor.process(job(event.id));
    expect(
      await prisma.inboundEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({ normalizedStatus: 'PROCESSED' });
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
    expect(publisher.publish).toHaveBeenCalledTimes(3);
  });

  it('persists Facebook comment context only once, before its primary message', async () => {
    const id = randomUUID();
    const event = await prisma.inboundEvent.create({
      data: {
        provider: 'FACEBOOK',
        eventType: 'COMMENT',
        dedupKey: `FACEBOOK_COMMENT:page:${id}`,
        rawPayload: {
          pageId: id,
          postId: 'post',
          commentId: id,
          commenterId: id,
          text: 'Help',
          sentAt: '2026-01-01T00:00:00Z',
        },
      },
    });
    await processor.process(job(event.id));
    await processor.process(job(event.id));
    const message = await prisma.message.findFirstOrThrow({
      where: { inboundEventId: event.id },
    });
    const timeline = await prisma.message.findMany({
      where: { conversationId: message.conversationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({
      senderType: 'SYSTEM',
      content: 'Original Facebook Post: https://facebook.com/post',
    });
    expect(timeline[0].createdAt.getTime()).toBe(
      message.createdAt.getTime() - 1000,
    );
  });

  it('documents the existing CLOSED/unique-thread conflict without changing schema or policy', async () => {
    const event = await emailEvent();
    await processor.process(job(event.id));
    const message = await prisma.message.findFirstOrThrow({
      where: { inboundEventId: event.id },
    });
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { status: 'CLOSED' },
    });
    const next = await emailEvent({
      ...(event.rawPayload as Record<string, unknown>),
      messageId: randomUUID(),
    });
    await expect(processor.process(job(next.id))).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(
      await prisma.message.count({ where: { inboundEventId: next.id } }),
    ).toBe(0);
    expect(
      await prisma.conversation.findUniqueOrThrow({
        where: { id: message.conversationId },
      }),
    ).toMatchObject({ status: 'CLOSED' });
  });

  it('detects a real OCC conflict without losing the concurrent API update', async () => {
    const first = await emailEvent();
    await processor.process(job(first.id));
    const primary = await prisma.message.findFirstOrThrow({
      where: { inboundEventId: first.id },
    });
    const next = await emailEvent({
      ...(first.rawPayload as Record<string, unknown>),
      messageId: randomUUID(),
    });
    const update = repository.updateConversation.bind(repository);
    const race = jest
      .spyOn(repository, 'updateConversation')
      .mockImplementationOnce(async (tx, id, version, data) => {
        // Simulate an API transaction after the Worker read its conversation snapshot.
        await prisma.conversation.update({
          where: { id },
          data: { version: { increment: 1 }, priority: 'HIGH' },
        });
        return update(tx, id, version, data);
      });
    await expect(processor.process(job(next.id))).rejects.toThrow(
      'OCC Conflict',
    );
    expect(
      await prisma.message.count({ where: { inboundEventId: next.id } }),
    ).toBe(0);
    expect(
      await prisma.conversation.findUniqueOrThrow({
        where: { id: primary.conversationId },
      }),
    ).toMatchObject({ priority: 'HIGH', version: 2 });
    race.mockRestore();
    await processor.process(job(next.id));
    expect(
      await prisma.message.count({ where: { inboundEventId: next.id } }),
    ).toBe(1);
  });

  async function withQueue(
    test: (
      queue: Queue<InboundEventJobPayload>,
      queueEvents: QueueEvents,
    ) => Promise<void>,
  ) {
    const prefix = `${schema}_${randomUUID().replaceAll('-', '')}`;
    const queue = new Queue<InboundEventJobPayload>('inbound-events', {
      connection: redis,
      prefix,
    });
    const queueEvents = new QueueEvents('inbound-events', {
      connection: redis,
      prefix,
    });
    const worker = new Worker<InboundEventJobPayload>(
      'inbound-events',
      (queued) => processor.process(queued),
      { connection: redis, prefix },
    );
    try {
      await Promise.all([
        queueEvents.waitUntilReady(),
        worker.waitUntilReady(),
      ]);
      await test(queue, queueEvents);
    } finally {
      await worker.close();
      // Only this generated prefix is ever removed; no FLUSHDB or global cleanup.
      await queue.obliterate();
      await queue.close();
      await queueEvents.close();
    }
  }
  function payload(id: string): InboundEventJobPayload {
    return {
      inboundEventId: id,
      provider: 'EMAIL',
      eventType: 'EMAIL_RECEIVED',
      dedupKey: 'test',
    };
  }

  it('retries a transient failure using real BullMQ backoff', async () => {
    const event = await emailEvent();
    jest
      .spyOn(email, 'normalize')
      .mockRejectedValueOnce(new Error('transient normalization dependency'));
    await withQueue(async (queue, queueEvents) => {
      const queued = await queue.add(
        'process-inbound-event',
        payload(event.id),
        { attempts: 3, backoff: { type: 'exponential', delay: 10 } },
      );
      await queued.waitUntilFinished(queueEvents, 10000);
      expect((await queue.getJob(queued.id!))?.attemptsMade).toBe(2);
    });
    expect(
      await prisma.inboundEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({ normalizedStatus: 'PROCESSED' });
  });

  it('retries unfinished work if reconciliation resets the lease during normalization', async () => {
    const event = await emailEvent();
    const original = email.normalize.bind(email);
    jest.spyOn(email, 'normalize').mockImplementationOnce(async (input) => {
      await prisma.inboundEvent.update({
        where: { id: input.id },
        data: { normalizedStatus: 'PENDING', processingStartedAt: null },
      });
      return original(input);
    });
    await withQueue(async (queue, queueEvents) => {
      const queued = await queue.add(
        'process-inbound-event',
        payload(event.id),
        { attempts: 3, backoff: { type: 'exponential', delay: 10 } },
      );
      await queued.waitUntilFinished(queueEvents, 10000);
      expect((await queue.getJob(queued.id!))?.attemptsMade).toBe(2);
    });
    expect(
      await prisma.inboundEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({ normalizedStatus: 'PROCESSED' });
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
  });

  it('does not auto-retry permanent validation errors and supports explicit replay', async () => {
    const event = await emailEvent();
    await prisma.inboundEvent.update({
      where: { id: event.id },
      data: { rawPayload: {} },
    });
    const normalized = jest.spyOn(email, 'normalize');
    await withQueue(async (queue, queueEvents) => {
      const queued = await queue.add(
        'process-inbound-event',
        payload(event.id),
        { attempts: 3 },
      );
      await expect(
        queued.waitUntilFinished(queueEvents, 10000),
      ).rejects.toThrow('Invalid email payload');
      expect(normalized).toHaveBeenCalledTimes(1);
      expect(
        await prisma.inboundEvent.findUniqueOrThrow({
          where: { id: event.id },
        }),
      ).toMatchObject({ normalizedStatus: 'FAILED' });
      await prisma.inboundEvent.update({
        where: { id: event.id },
        data: { rawPayload: event.rawPayload as Prisma.InputJsonValue },
      });
      // Same BullMQ retry operation used by the existing admin replay endpoint.
      await queued.retry();
      await queued.waitUntilFinished(queueEvents, 10000);
    });
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
  });
});
