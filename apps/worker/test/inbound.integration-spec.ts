import { randomUUID } from 'node:crypto';
import { ConversationsRepository } from '../../api/src/modules/conversations/conversations.repository';
import { OutboxService } from '../../api/src/common/outbox/outbox.service';
import { SlaCheckProcessor } from '../src/processors/sla-check.processor';
import { AutoCloseProcessor } from '../src/processors/auto-close.processor';
import { OutboundMessagesProcessor } from '../src/processors/outbound-messages.processor';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  Prisma,
  type Conversation,
  ChannelType,
  ConversationStatus,
  InboundEventStatus,
  InboundEventType,
  MessageDirection,
  MessageSenderType,
  Priority,
  UserRole,
  InboundProvider,
  OutboundMessageStatus,
  OutboundProvider,
} from '@prisma/client';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import type { InboundEventJobPayload } from '@omnidesk/shared';
import { classifyDatabaseError } from '@omnidesk/shared';
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
    const previousInstance = process.env.INSTANCE_ID;
    process.env.INSTANCE_ID = `integration-admin-${randomUUID().slice(0, 8)}`;
    try {
      admin = new PrismaService({ datasourceUrl: databaseUrl });
    } finally {
      if (previousInstance === undefined) delete process.env.INSTANCE_ID;
      else process.env.INSTANCE_ID = previousInstance;
    }
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
        provider: InboundProvider.EMAIL,
        eventType: InboundEventType.EMAIL_RECEIVED,
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
      normalizedStatus: InboundEventStatus.PROCESSED,
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
      data: {
        normalizedStatus: InboundEventStatus.PENDING,
        processingStartedAt: null,
      },
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
      data: { status: ConversationStatus.RESOLVED, resolvedAt: new Date() },
      include: { ticket: true },
    });
    await prisma.inboundEvent.update({
      where: { id: event.id },
      data: { normalizedStatus: InboundEventStatus.FAILED },
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
    ).toMatchObject({ normalizedStatus: InboundEventStatus.PROCESSED });
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
    ).toMatchObject({
      normalizedStatus: InboundEventStatus.FAILED,
      processingStartedAt: null,
    });
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
    ).toMatchObject({ normalizedStatus: InboundEventStatus.PROCESSED });
    expect(
      await prisma.message.count({ where: { inboundEventId: event.id } }),
    ).toBe(1);
    expect(publisher.publish).toHaveBeenCalledTimes(3);
  });

  it('persists Facebook comment context only once, before its primary message', async () => {
    const id = randomUUID();
    const event = await prisma.inboundEvent.create({
      data: {
        provider: InboundProvider.FACEBOOK,
        eventType: InboundEventType.COMMENT,
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
      senderType: MessageSenderType.SYSTEM,
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
      data: { status: ConversationStatus.CLOSED },
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
    ).toMatchObject({ status: ConversationStatus.CLOSED });
  });

  it('refreshes a snapshot after locking and retains OCC as a defensive guard', async () => {
    const first = await emailEvent();
    await processor.process(job(first.id));
    const primary = await prisma.message.findFirstOrThrow({
      where: { inboundEventId: first.id },
    });
    const next = await emailEvent({
      ...(first.rawPayload as Record<string, unknown>),
      messageId: randomUUID(),
    });
    const read = repository.conversation.bind(repository);
    const race = jest
      .spyOn(repository, 'conversation')
      .mockImplementationOnce(async (tx, account, message) => {
        // These tests exercise awaited queries, not Prisma's fluent relation API.
        // Narrow the view of the actual delegate rather than casting an ordinary
        // Promise to a Prisma query client with methods it does not implement.
        const queries: {
          findFirst(
            args?: Prisma.ConversationFindFirstArgs,
          ): Promise<Conversation | null>;
        } = tx.conversation;
        const find = queries.findFirst.bind(queries);
        const snapshot = jest
          .spyOn(queries, 'findFirst')
          .mockImplementationOnce(async (args) => {
            const stale = await find(args);
            await prisma.conversation.update({
              where: { id: primary.conversationId },
              data: { version: { increment: 1 }, priority: Priority.HIGH },
            });
            return stale;
          });
        try {
          return await read(tx, account, message);
        } finally {
          snapshot.mockRestore();
        }
      });
    await processor.process(job(next.id));
    race.mockRestore();
    expect(
      await prisma.conversation.findUniqueOrThrow({
        where: { id: primary.conversationId },
      }),
    ).toMatchObject({ priority: Priority.HIGH, version: 3 });
    expect(
      await prisma.message.count({ where: { inboundEventId: next.id } }),
    ).toBe(1);
    await expect(
      prisma.$transaction((tx) =>
        repository.updateConversation(tx, primary.conversationId, 1, {
          priority: Priority.LOW,
          version: { increment: 1 },
        }),
      ),
    ).rejects.toThrow('OCC Conflict');
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: primary.conversationId },
        })
      ).priority,
    ).toBe(Priority.HIGH);
  });

  async function withQueue(
    test: (
      queue: Queue<InboundEventJobPayload>,
      queueEvents: QueueEvents,
    ) => Promise<void>,
    run: (queued: Job<InboundEventJobPayload>) => Promise<void> = (queued) =>
      processor.process(queued),
  ) {
    const prefix = `${schema}_${randomUUID().replaceAll('-', '')}`;
    // Pass plain connection options across the BullMQ/ioredis package boundary.
    // Each BullMQ owner closes its own connection in the teardown below.
    const connection = {
      host: redis.options.host,
      port: redis.options.port,
      username: redis.options.username,
      password: redis.options.password,
      db: redis.options.db,
      tls: redis.options.tls,
      maxRetriesPerRequest: null,
    };
    const queue = new Queue<InboundEventJobPayload>('inbound-events', {
      connection,
      prefix,
    });
    const queueEvents = new QueueEvents('inbound-events', {
      connection,
      prefix,
    });
    const worker = new Worker<InboundEventJobPayload>('inbound-events', run, {
      connection,
      prefix,
    });
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
      provider: InboundProvider.EMAIL,
      eventType: InboundEventType.EMAIL_RECEIVED,
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
    ).toMatchObject({ normalizedStatus: InboundEventStatus.PROCESSED });
  });

  it('retries unfinished work if reconciliation resets the lease during normalization', async () => {
    const event = await emailEvent();
    const original = email.normalize.bind(email);
    jest.spyOn(email, 'normalize').mockImplementationOnce(async (input) => {
      await prisma.inboundEvent.update({
        where: { id: input.id },
        data: {
          normalizedStatus: InboundEventStatus.PENDING,
          processingStartedAt: null,
        },
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
    ).toMatchObject({ normalizedStatus: InboundEventStatus.PROCESSED });
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
      ).toMatchObject({ normalizedStatus: InboundEventStatus.FAILED });
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
  function apiRepository() {
    return new ConversationsRepository(
      prisma as never,
      new OutboxService(prisma as never),
      { trigger: jest.fn() } as never,
    );
  }
  async function aggregate() {
    const key = randomUUID();
    const thread = {
      mailbox: `${key}@support.test`,
      fromEmail: `${key}@customer.test`,
      threadId: key,
    };
    const first = await emailEvent({
      ...thread,
      receivedAt: new Date(Date.now() - 3600000).toISOString(),
    });
    await processor.process(job(first.id));
    const message = await prisma.message.findFirstOrThrow({
      where: { inboundEventId: first.id },
    });
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: message.conversationId },
      include: { ticket: true },
    });
    return { conversation, thread, first };
  }

  it('resumes SLA from normalized customer time once, and duplicate delivery preserves version', async () => {
    const { conversation, thread } = await aggregate();
    const api = apiRepository();
    await api.updateStatus(
      conversation.id,
      ConversationStatus.WAITING_CUSTOMER,
      conversation.version,
    );
    const waiting = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { ticket: true },
    });
    const receivedAt = new Date(waiting.ticket!.slaPausedAt!.getTime() + 60000);
    const next = await emailEvent({
      ...thread,
      receivedAt: receivedAt.toISOString(),
      messageId: randomUUID(),
    });
    await processor.process(job(next.id));
    const resumed = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { ticket: true },
    });
    expect(resumed.status).toBe(ConversationStatus.IN_PROGRESS);
    expect(resumed.version).toBe(waiting.version + 1);
    expect(resumed.ticket!.slaDueAt!.getTime()).toBe(
      waiting.ticket!.slaDueAt!.getTime() + 60000,
    );
    expect(resumed.ticket!.slaPausedAt).toBeNull();
    const duplicate = await emailEvent({
      ...thread,
      receivedAt: receivedAt.toISOString(),
      messageId: (next.rawPayload as Record<string, unknown>).messageId,
    });
    await processor.process(job(duplicate.id));
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).version,
    ).toBe(resumed.version);
    await expect(
      api.updateStatus(
        conversation.id,
        ConversationStatus.RESOLVED,
        waiting.version,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('serializes an API status change racing customer inbound without losing a version', async () => {
    const { conversation, thread } = await aggregate();
    const incoming = await emailEvent({
      ...thread,
      receivedAt: new Date().toISOString(),
    });
    const outcomes = await Promise.allSettled([
      apiRepository().updateStatus(
        conversation.id,
        ConversationStatus.RESOLVED,
        conversation.version,
      ),
      processor.process(job(incoming.id)),
    ]);
    expect(outcomes[1].status).toBe('fulfilled');
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    if (outcomes[0].status === 'rejected') {
      expect(outcomes[0].reason).toMatchObject({ status: 409 });
      expect(after.version).toBe(conversation.version + 1);
    } else {
      expect(after.version).toBe(conversation.version + 2);
      expect(after.status).toBe(ConversationStatus.IN_PROGRESS);
    }
    expect(
      await prisma.message.count({ where: { inboundEventId: incoming.id } }),
    ).toBe(1);
  });

  it('skips a locked SLA candidate then reconciles exactly once using processing time', async () => {
    const { conversation } = await aggregate();
    await prisma.ticket.update({
      where: { conversationId: conversation.id },
      data: { slaDueAt: new Date(Date.now() - 1000), isOverdue: false },
    });
    const sla = new SlaCheckProcessor(prisma, publisher as never);
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${conversation.id}::uuid FOR UPDATE`;
      locked();
      await hold;
    });
    await ready;
    try {
      await sla.process({ data: { requestedAt: '2000-01-01' } } as never);
      expect(
        (
          await prisma.ticket.findUniqueOrThrow({
            where: { conversationId: conversation.id },
          })
        ).isOverdue,
      ).toBe(false);
    } finally {
      release();
      await transaction;
    }
    await sla.process({ data: { requestedAt: '2000-01-01' } } as never);
    await sla.process({ data: { requestedAt: '2000-01-01' } } as never);
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).version,
    ).toBe(conversation.version + 1);
    expect(
      (
        await prisma.ticket.findUniqueOrThrow({
          where: { conversationId: conversation.id },
        })
      ).isOverdue,
    ).toBe(true);
  });

  it('protects a reopened conversation from auto-close and versions a real close once', async () => {
    const { conversation } = await aggregate();
    const old = new Date(Date.now() - 4 * 86400000);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: ConversationStatus.RESOLVED, resolvedAt: old },
    });
    const close = new AutoCloseProcessor(prisma);
    const lookup = jest.spyOn(candidateQueries(), 'findMany');
    lookup.mockImplementationOnce(async () => {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.IN_PROGRESS, resolvedAt: null },
      });
      return [{ id: conversation.id }];
    });
    await close.process({ data: { requestedAt: '2000-01-01' } } as never);
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).status,
    ).toBe(ConversationStatus.IN_PROGRESS);
    lookup.mockRestore();
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: ConversationStatus.RESOLVED, resolvedAt: old },
    });
    await close.process({ data: { requestedAt: '2000-01-01' } } as never);
    await close.process({ data: { requestedAt: '2000-01-01' } } as never);
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).version,
    ).toBe(conversation.version + 1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: conversation.id,
          type: 'CONVERSATION_STATUS_CHANGED',
        },
      }),
    ).toBe(1);
  });

  it('finalizes a checkpointed outbound once, preserves CLOSED and advances the aggregate version', async () => {
    const { conversation } = await aggregate();
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: ConversationStatus.CLOSED },
    });
    const agent = await prisma.user.create({
      data: {
        email: `${randomUUID()}@agent.test`,
        name: 'Test agent',
        passwordHash: 'test-only',
        role: UserRole.AGENT,
      },
    });
    const outgoing = await prisma.outboundMessage.create({
      data: {
        conversationId: conversation.id,
        channelType: ChannelType.EMAIL,
        provider: OutboundProvider.EMAIL,
        content: 'Reply',
        createdBy: agent.id,
        status: OutboundMessageStatus.SENDING,
        externalMessageId: randomUUID(),
        sentAt: new Date(),
      },
    });
    const outbound = new OutboundMessagesProcessor(
      prisma,
      {} as never,
      publisher as never,
    );
    const work = {
      data: { outboundMessageId: outgoing.id },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as never;
    await Promise.all([outbound.process(work), outbound.process(work)]);
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(after.status).toBe(ConversationStatus.CLOSED);
    expect(after.version).toBe(conversation.version + 1);
    expect(
      await prisma.message.count({
        where: {
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
        },
      }),
    ).toBe(1);
  });

  it('applies per-session PostgreSQL limits and bounds the connection pool', async () => {
    const settings = await prisma.$queryRaw<
      { application: string; lock: string; statement: string; idle: string }[]
    >`SELECT current_setting('application_name') AS application, current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement, current_setting('idle_in_transaction_session_timeout') AS idle`;
    expect(settings[0]).toMatchObject({
      application: expect.stringContaining('omnidesk-worker:'),
      lock: '1s',
      statement: '5s',
      idle: '10s',
    });
    await Promise.all(
      Array.from(
        { length: 12 },
        () => prisma.$queryRaw`SELECT 1::int AS value FROM pg_sleep(0.02)`,
      ),
    );
    const [count] = await prisma.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = current_setting('application_name') AND datname = current_database()`;
    // The admin uses a distinct instance label; this count is the Worker pool only.
    expect(count.count).toBeLessThanOrEqual(5);
  });

  it('fails lock waits within the session limit and rolls back timed-out transactions', async () => {
    const { conversation } = await aggregate();
    let ready!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const owner = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${conversation.id}::uuid FOR UPDATE`;
      ready();
      await hold;
    });
    await acquired;
    const started = Date.now();
    try {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${conversation.id}::uuid FOR UPDATE`;
        }),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      release();
      await owner;
    }
    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.conversation.update({
            where: { id: conversation.id },
            data: { subject: 'Must roll back' },
          });
          await new Promise((resolve) => setTimeout(resolve, 200));
          await tx.conversation.findUnique({ where: { id: conversation.id } });
        },
        { timeout: 100 },
      ),
    ).rejects.toThrow();
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).subject,
    ).not.toBe('Must roll back');
  });
  it('cancels a statement that exceeds the per-session statement timeout', async () => {
    const started = Date.now();
    await expect(
      prisma.$queryRaw`SELECT 1::int AS value FROM pg_sleep(6)`,
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(6500);
    await expect(prisma.$queryRaw`SELECT 1::int AS value`).resolves.toEqual([
      { value: 1 },
    ]);
  });

  function gate() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }

  function candidateQueries() {
    const queries: {
      findMany(
        args?: Prisma.ConversationFindManyArgs,
      ): Promise<{ id: string }[]>;
    } = prisma.conversation;
    return queries;
  }

  async function waitForBlockedSession() {
    for (let attempt = 0; attempt < 50; attempt++) {
      const [row] = await admin.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND application_name = ${`omnidesk-worker:${process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? 'local'}`}`;
      if (row.count > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Expected an actual PostgreSQL lock waiter');
  }

  // Hold a real API transaction after writing its outbox, before COMMIT.
  function gatedApi() {
    const entered = gate();
    const finish = gate();
    const outbox = new OutboxService(prisma as never);
    const writer: {
      createEvent(
        ...args: Parameters<OutboxService['createEvent']>
      ): Promise<Awaited<ReturnType<OutboxService['createEvent']>>>;
    } = outbox;
    const write = writer.createEvent.bind(writer);
    jest.spyOn(writer, 'createEvent').mockImplementation(async (...args) => {
      const event = await write(...args);
      entered.release();
      await finish.promise;
      return event;
    });
    return {
      entered,
      finish,
      api: new ConversationsRepository(prisma as never, outbox, {
        trigger: jest.fn(),
      } as never),
    };
  }

  it('commits API pause before a blocked inbound resumes from customer time', async () => {
    const { conversation, thread } = await aggregate();
    const control = gatedApi();
    const pause = control.api.updateStatus(
      conversation.id,
      ConversationStatus.WAITING_CUSTOMER,
      conversation.version,
    );
    await control.entered.promise;
    const incoming = await emailEvent({
      ...thread,
      receivedAt: new Date(Date.now() + 60000).toISOString(),
    });
    const resume = processor.process(job(incoming.id));
    try {
      await waitForBlockedSession();
    } finally {
      control.finish.release();
    }
    const waiting = await pause;
    await resume;
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { ticket: true },
    });
    expect(after.status).toBe(ConversationStatus.IN_PROGRESS);
    expect(after.version).toBe(conversation.version + 2);
    expect(after.ticket!.slaPausedAt).toBeNull();
    const received = new Date(
      (incoming.rawPayload as { receivedAt: string }).receivedAt,
    );
    expect(after.ticket!.slaDueAt!.getTime()).toBe(
      waiting.ticket!.slaDueAt!.getTime() +
        received.getTime() -
        waiting.ticket!.slaPausedAt!.getTime(),
    );
  });

  it('rejects a stale API pause when inbound commits first', async () => {
    const { conversation, thread } = await aggregate();
    const entered = gate();
    const finish = gate();
    const update = repository.updateConversation.bind(repository);
    jest
      .spyOn(repository, 'updateConversation')
      .mockImplementation(async (...args) => {
        await update(...args);
        entered.release();
        await finish.promise;
      });
    const incoming = await emailEvent({
      ...thread,
      receivedAt: new Date().toISOString(),
    });
    const inbound = processor.process(job(incoming.id));
    await entered.promise;
    const pause = apiRepository().updateStatus(
      conversation.id,
      ConversationStatus.WAITING_CUSTOMER,
      conversation.version,
    );
    const rejected = expect(pause).rejects.toMatchObject({ status: 409 });
    try {
      await waitForBlockedSession();
    } finally {
      finish.release();
    }
    await Promise.all([inbound, rejected]);
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { ticket: true },
    });
    expect(after.status).toBe(ConversationStatus.NEW);
    expect(after.version).toBe(conversation.version + 1);
    expect(after.ticket!.slaPausedAt).toBeNull();
  });

  it.each([
    ConversationStatus.WAITING_CUSTOMER,
    ConversationStatus.IN_PROGRESS,
    ConversationStatus.RESOLVED,
  ] as const)(
    'rechecks a stale SLA candidate after an API transition to %s',
    async (status) => {
      const { conversation } = await aggregate();
      await prisma.ticket.update({
        where: { conversationId: conversation.id },
        data: {
          slaDueAt: new Date(Date.now() - 60000),
          slaPausedAt:
            status === ConversationStatus.IN_PROGRESS
              ? new Date(Date.now() - 3600000)
              : null,
          isOverdue: true,
        },
      });
      if (status === ConversationStatus.IN_PROGRESS)
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: ConversationStatus.WAITING_CUSTOMER },
        });
      const selected = gate();
      const proceed = gate();
      const scan = jest
        .spyOn(candidateQueries(), 'findMany')
        .mockImplementationOnce(async () => {
          selected.release();
          await proceed.promise;
          return [{ id: conversation.id }];
        });
      const check = new SlaCheckProcessor(prisma, publisher as never).process({
        data: { requestedAt: '2000-01-01' },
      } as never);
      await selected.promise;
      try {
        await apiRepository().updateStatus(
          conversation.id,
          status,
          conversation.version,
        );
      } finally {
        proceed.release();
      }
      await check;
      scan.mockRestore();
      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: { ticket: true },
      });
      expect(after.status).toBe(status);
      expect(after.ticket!.isOverdue).toBe(false);
      expect(after.version).toBe(conversation.version + 1);
    },
  );

  async function checkpointedOutbound(conversationId: string) {
    const agent = await prisma.user.create({
      data: {
        email: `${randomUUID()}@agent.test`,
        name: 'Test agent',
        passwordHash: 'test-only',
        role: UserRole.AGENT,
      },
    });
    return prisma.outboundMessage.create({
      data: {
        conversationId,
        channelType: ChannelType.EMAIL,
        provider: OutboundProvider.EMAIL,
        content: 'Reply',
        createdBy: agent.id,
        status: OutboundMessageStatus.SENDING,
        externalMessageId: randomUUID(),
        sentAt: new Date(),
      },
    });
  }

  it('preserves agent resolution while outbound finalization waits for the API lock', async () => {
    const { conversation } = await aggregate();
    const outgoing = await checkpointedOutbound(conversation.id);
    const control = gatedApi();
    const resolve = control.api.updateStatus(
      conversation.id,
      ConversationStatus.RESOLVED,
      conversation.version,
    );
    await control.entered.promise;
    const finalize = new OutboundMessagesProcessor(
      prisma,
      {} as never,
      publisher as never,
    ).process({
      data: { outboundMessageId: outgoing.id },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as never);
    try {
      await waitForBlockedSession();
    } finally {
      control.finish.release();
    }
    await Promise.all([resolve, finalize]);
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { ticket: true },
    });
    expect(after.status).toBe(ConversationStatus.RESOLVED);
    expect(after.resolvedAt).not.toBeNull();
    expect(after.ticket!.isOverdue).toBe(false);
    expect(after.version).toBe(conversation.version + 2);
    expect(
      await prisma.message.count({
        where: {
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
        },
      }),
    ).toBe(1);
  });

  it('does not auto-close a stale candidate that the agent has just resolved again', async () => {
    const { conversation } = await aggregate();
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.RESOLVED,
        resolvedAt: new Date(Date.now() - 4 * 86400000),
      },
    });
    const selected = gate();
    const proceed = gate();
    const queries = candidateQueries();
    const find = queries.findMany.bind(queries);
    jest.spyOn(queries, 'findMany').mockImplementationOnce(async (...args) => {
      const candidates = await find(...args);
      expect(
        candidates.some((candidate) => candidate.id === conversation.id),
      ).toBe(true);
      selected.release();
      await proceed.promise;
      return candidates;
    });
    const close = new AutoCloseProcessor(prisma).process({
      data: { requestedAt: '2000-01-01' },
    } as never);
    await selected.promise;
    try {
      await apiRepository().updateStatus(
        conversation.id,
        ConversationStatus.IN_PROGRESS,
        conversation.version,
      );
      await apiRepository().updateStatus(
        conversation.id,
        ConversationStatus.RESOLVED,
        conversation.version + 1,
      );
    } finally {
      proceed.release();
    }
    await close;
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(after.status).toBe(ConversationStatus.RESOLVED);
    expect(after.version).toBe(conversation.version + 2);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: conversation.id,
          type: 'CONVERSATION_STATUS_CHANGED',
        },
      }),
    ).toBe(2);
  });

  it('classifies a real lock timeout and retries ingestion through BullMQ without partial writes', async () => {
    const { conversation, thread } = await aggregate();
    const incoming = await emailEvent({
      ...thread,
      receivedAt: new Date().toISOString(),
    });
    const acquired = gate();
    const finish = gate();
    const owner = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${conversation.id}::uuid FOR UPDATE`;
      acquired.release();
      await finish.promise;
    });
    await acquired.promise;
    const failures: string[] = [];
    const failedAt: number[] = [];
    const attempts: number[] = [];
    try {
      await withQueue(
        async (queue, queueEvents) => {
          const queued = await queue.add(
            'process-inbound-event',
            payload(incoming.id),
            { attempts: 3, backoff: { type: 'exponential', delay: 100 } },
          );
          await queued.waitUntilFinished(queueEvents, 10000);
          expect((await queue.getJob(queued.id!))?.attemptsMade).toBe(2);
        },
        async (queued) => {
          attempts.push(Date.now());
          try {
            await processor.process(queued);
          } catch (error) {
            failures.push(classifyDatabaseError(error));
            expect(
              await prisma.message.count({
                where: { inboundEventId: incoming.id },
              }),
            ).toBe(0);
            expect(
              (
                await prisma.conversation.findUniqueOrThrow({
                  where: { id: conversation.id },
                })
              ).version,
            ).toBe(conversation.version);
            failedAt.push(Date.now());
            finish.release();
            await owner;
            throw error;
          }
        },
      );
    } finally {
      finish.release();
      await owner;
    }
    expect(failures).toEqual(['lock_timeout']);
    expect(attempts[1] - failedAt[0]).toBeGreaterThanOrEqual(90);
    expect(
      await prisma.message.count({ where: { inboundEventId: incoming.id } }),
    ).toBe(1);
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).version,
    ).toBe(conversation.version + 1);
    expect(
      (
        await prisma.inboundEvent.findUniqueOrThrow({
          where: { id: incoming.id },
        })
      ).normalizedStatus,
    ).toBe(InboundEventStatus.PROCESSED);
  });

  it('bounds a one-slot pool, classifies exhaustion and retries the actual Worker after release', async () => {
    const incoming = await emailEvent();
    const previous = { ...process.env };
    let tiny: PrismaService;
    try {
      process.env.WORKER_DB_POOL_SIZE = '1';
      process.env.DB_POOL_TIMEOUT_SECONDS = '1';
      process.env.INSTANCE_ID = `tiny-${randomUUID().slice(0, 8)}`;
      tiny = new PrismaService({
        datasourceUrl: new URL(
          `?schema=${schema}`,
          process.env.INBOUND_TEST_DATABASE_URL,
        ).toString(),
      });
    } finally {
      for (const key of [
        'WORKER_DB_POOL_SIZE',
        'DB_POOL_TIMEOUT_SECONDS',
        'INSTANCE_ID',
      ]) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
    const tinyEvents = new InboundEventRepository(tiny);
    const smallProcessor = new InboundEventsProcessor(
      tinyEvents,
      registry,
      new InboundIngestionService(tiny, repository, tinyEvents),
      new InboundNotificationsService(publisher as never),
    );
    const acquired = gate();
    const finish = gate();
    const owner = tiny.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      acquired.release();
      await finish.promise;
    });
    await acquired.promise;
    const failures: string[] = [];
    const attempts: number[] = [];
    const failedAt: number[] = [];
    try {
      await withQueue(
        async (queue, queueEvents) => {
          const queued = await queue.add(
            'process-inbound-event',
            payload(incoming.id),
            { attempts: 3, backoff: { type: 'exponential', delay: 100 } },
          );
          await queued.waitUntilFinished(queueEvents, 10000);
          expect((await queue.getJob(queued.id!))?.attemptsMade).toBe(2);
        },
        async (queued) => {
          attempts.push(Date.now());
          try {
            await smallProcessor.process(queued);
          } catch (error) {
            failures.push(classifyDatabaseError(error));
            const [row] = await admin.$queryRaw<
              { count: number }[]
            >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name LIKE 'omnidesk-worker:tiny-%' AND datname = current_database()`;
            expect(row.count).toBe(1);
            expect(
              await prisma.message.count({
                where: { inboundEventId: incoming.id },
              }),
            ).toBe(0);
            failedAt.push(Date.now());
            finish.release();
            await owner;
            throw error;
          }
        },
      );
      expect(failures).toEqual(['pool_timeout']);
      expect(attempts[1] - failedAt[0]).toBeGreaterThanOrEqual(90);
      expect(
        await prisma.message.count({ where: { inboundEventId: incoming.id } }),
      ).toBe(1);
    } finally {
      finish.release();
      await owner;
      await tiny.$disconnect();
    }
  });
});
