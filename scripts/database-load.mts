import { classifyDatabaseError } from "../packages/shared/dist/database-config.js";
import { fileURLToPath } from "node:url";

// Local/staging acceptance harness. No development tables, shared BullMQ queues,
// provider calls or authentication secrets are used by this experiment.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fork, spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadPrisma, loadPrismaService } from "./lib/prisma-runtime.mts";
import type { ArgumentsHost } from "@nestjs/common";
import type { PrismaClient, Conversation } from "@prisma/client";
import type {
  Job,
  Queue as QueueClient,
  QueueEvents as QueueEventsClient,
} from "bullmq";

interface RuntimeMetrics {
  failures: Record<string, number>;
  completed?: number;
  attempts?: ReturnType<typeof summary>;
}
interface RuntimeMessage {
  type: "ready" | "stopped" | "stop" | "error";
  address?: string;
  metrics?: RuntimeMetrics;
}
function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    ["ready", "stopped", "stop", "error"].includes(String(value.type))
  );
}
const root = resolve(import.meta.dirname, "..");
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const workerRequire = createRequire(resolve(root, "apps/worker/package.json"));

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) =>
    Number(
      (
        sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
      ).toFixed(2),
    );
  return {
    count: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    maxMs: at(1),
  };
}

async function child() {
  if (!process.send) throw new Error("Load child requires IPC");
  const send = process.send.bind(process);
  const [role, checkout, prefix, concurrency] = process.argv.slice(3);
  const url = process.env.DATABASE_URL;
  const localApi = createRequire(resolve(checkout, "apps/api/package.json"));
  const localWorker = createRequire(
    resolve(checkout, "apps/worker/package.json"),
  );
  // Base/current compiled modules are a deliberate dynamic interop boundary.
  const load = (req: NodeRequire, file: string): Record<string, any> =>
    req(`./dist/${file}.js`);
  const { Logger } = localApi("@nestjs/common");
  Logger.overrideLogger(false);
  const PrismaService =
    role === "api"
      ? loadPrismaService(localApi, "./dist/common/database/prisma.service.js")
      : loadPrismaService(localWorker, "./dist/database/prisma.service.js");
  const prisma = new PrismaService({ datasourceUrl: url });
  let close: () => Promise<void>;
  let getMetrics: () => RuntimeMetrics = () => ({ failures: {} });
  if (role === "api") {
    const { Test } = localApi("@nestjs/testing");
    const { ValidationPipe, VersioningType } = localApi("@nestjs/common");
    const { ConversationsController } = load(
      localApi,
      "modules/conversations/conversations.controller",
    );
    const { ConversationsService } = load(
      localApi,
      "modules/conversations/conversations.service",
    );
    const { ConversationsRepository } = load(
      localApi,
      "modules/conversations/conversations.repository",
    );
    const { OutboxService } = load(localApi, "common/outbox/outbox.service");
    const repository = new ConversationsRepository(
      prisma,
      new OutboxService(prisma),
      { trigger() {} },
    );
    const service = new ConversationsService(repository, {
      publishToConversation() {},
      publishToAgent() {},
    });
    const fixture = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [{ provide: ConversationsService, useValue: service }],
    }).compile();
    const app = fixture.createNestApplication({ logger: false });
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    const failures: Record<string, number> = {};
    app.useGlobalFilters({
      catch(error: unknown, host: ArgumentsHost) {
        const status =
          typeof error === "object" &&
          error !== null &&
          "getStatus" in error &&
          typeof error.getStatus === "function"
            ? Number(error.getStatus())
            : 500;
        const category =
          status === 409 ? "version_conflict" : classifyDatabaseError(error);
        failures[category] = (failures[category] ?? 0) + 1;
        host.switchToHttp().getResponse().status(status).json({ category });
      },
    });
    await app.listen(0, "127.0.0.1");
    close = async () => {
      await app.close();
      await prisma.$disconnect();
    };
    getMetrics = () => ({ failures });
    send({ type: "ready", address: await app.getUrl() });
  } else {
    const Redis = localWorker("ioredis");
    const { Worker } = localWorker("bullmq");
    const { InboundEventRepository } = load(
      localWorker,
      "inbound/ingestion/inbound-event.repository",
    );
    const { InboundIngestionRepository } = load(
      localWorker,
      "inbound/ingestion/inbound-ingestion.repository",
    );
    const { InboundIngestionService } = load(
      localWorker,
      "inbound/ingestion/inbound-ingestion.service",
    );
    const { InboundEventsProcessor } = load(
      localWorker,
      "processors/inbound-events.processor",
    );
    const { InboundAdapterRegistry } = load(
      localWorker,
      "inbound/adapters/inbound-adapter.registry",
    );
    const { EmailInboundAdapter } = load(
      localWorker,
      "inbound/adapters/email-inbound.adapter",
    );
    const events = new InboundEventRepository(prisma);
    const processor = new InboundEventsProcessor(
      events,
      new InboundAdapterRegistry([new EmailInboundAdapter()]),
      new InboundIngestionService(
        prisma,
        new InboundIngestionRepository(),
        events,
      ),
      { async publish() {} },
    );
    const redis = new Redis(process.env.INBOUND_TEST_REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    const durations: number[] = [];
    const failures: Record<string, number> = {};
    let completed = 0;
    const worker = new Worker(
      "inbound-events",
      async (job: Job) => {
        const started = performance.now();
        try {
          await processor.process(job);
          completed++;
        } catch (error) {
          const category = classifyDatabaseError(error);
          failures[category] = (failures[category] ?? 0) + 1;
          throw error;
        } finally {
          durations.push(performance.now() - started);
        }
      },
      { connection: redis, prefix, concurrency: Number(concurrency) },
    );
    // Keep errors inside the redacted metrics protocol.
    worker.on("error", () => send({ type: "error" }));
    await worker.waitUntilReady();
    close = async () => {
      await worker.close();
      await redis.quit();
      await prisma.$disconnect();
    };
    getMetrics = () => ({ completed, attempts: summary(durations), failures });
    send({ type: "ready" });
  }
  process.on("message", async (message) => {
    if (!isRuntimeMessage(message) || message.type !== "stop") return;
    try {
      const metrics = getMetrics();
      await close();
      send({ type: "stopped", metrics }, () => process.exit(0));
    } catch {
      process.exit(1);
    }
  });
}

function startChild(
  role: "api" | "worker",
  checkout: string,
  url: string,
  prefix: string,
  concurrency: number,
  instance: string,
) {
  const child = fork(
    fileURLToPath(import.meta.url),
    ["child", role, checkout, prefix, String(concurrency)],
    {
      cwd: checkout,
      execArgv: ["--experimental-strip-types"],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: url,
        INSTANCE_ID: instance,
        API_DB_POOL_SIZE: "5",
        WORKER_DB_POOL_SIZE: "5",
        DB_POOL_TIMEOUT_SECONDS: "5",
        DB_TRANSACTION_MAX_WAIT_MS: "2000",
        DB_TRANSACTION_TIMEOUT_MS: "5000",
        DB_LOCK_TIMEOUT_MS: "1000",
        DB_STATEMENT_TIMEOUT_MS: "5000",
        DB_IDLE_TRANSACTION_TIMEOUT_MS: "10000",
      },
    },
  );
  const message = (type: RuntimeMessage["type"]) =>
    new Promise<RuntimeMessage>((done, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Load ${role} ${type} timeout`));
      }, 30000);
      const onMessage = (value: unknown) => {
        if (!isRuntimeMessage(value)) return;
        if (value.type === type) {
          cleanup();
          done(value);
        } else if (value.type === "error") {
          cleanup();
          reject(new Error(`Load ${role} failed`));
        }
      };
      const onExit = () => {
        cleanup();
        reject(new Error(`Load ${role} exited before ${type}`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("exit", onExit);
      };
      child.on("message", onMessage);
      child.on("exit", onExit);
    });
  return {
    child,
    ready: message("ready"),
    async stop() {
      const stopped = message("stopped");
      child.send({ type: "stop" });
      const metrics = (await stopped).metrics;
      if (!metrics) throw new Error("Missing load child metrics");
      return metrics;
    },
  };
}

async function main() {
  const base = process.argv[2];
  const baseRoot = resolve(process.argv[3] ?? "");
  if (
    !/^[a-f0-9]{40}$/.test(base ?? "") ||
    baseRoot === root ||
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: baseRoot,
      encoding: "utf8",
    }).trim() !== base
  )
    throw new Error(
      "Provide the exact base SHA and its separately built checkout",
    );
  if (
    !process.env.INBOUND_TEST_DATABASE_URL ||
    !process.env.INBOUND_TEST_REDIS_URL
  )
    throw new Error(
      "Set explicit INBOUND_TEST_DATABASE_URL and INBOUND_TEST_REDIS_URL",
    );
  const {
    PrismaClient,
    ChannelAccountType,
    ChannelType,
    ConversationStatus,
    InboundProvider,
    InboundEventType,
    InboundEventStatus,
    Priority,
  } = loadPrisma(apiRequire);
  const Redis = workerRequire("ioredis");
  const { Queue, QueueEvents } = workerRequire(
    "bullmq",
  ) as typeof import("bullmq");
  const monitoringUrl = new URL(process.env.INBOUND_TEST_DATABASE_URL);
  monitoringUrl.searchParams.set("connection_limit", "1");
  monitoringUrl.searchParams.set("application_name", "omnidesk-load-monitor");
  const admin = new PrismaClient({
    datasourceUrl: monitoringUrl.toString(),
    log: [],
  });
  const redis = new Redis(process.env.INBOUND_TEST_REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const results = [];
  const runId = randomUUID().replaceAll("-", "");
  try {
    const [server] = await admin.$queryRaw<
      { version: string; max_connections: number }[]
    >`SELECT version() AS version, current_setting('max_connections')::int AS max_connections`;
    for (let round = 1; round <= 3; round++) {
      // Alternate order to reduce a systematic warm-cache/order advantage.
      for (const phase of round % 2
        ? ["before", "after"]
        : ["after", "before"]) {
        const schema = `db_load_${runId}_${round}_${phase}`;
        const prefix = schema;
        const instance = `load-${round}-${phase}-${runId.slice(0, 8)}`;
        const checkout = phase === "before" ? baseRoot : root;
        const concurrency = phase === "before" ? 5 : 2;
        let client: PrismaClient | undefined;
        let api: ReturnType<typeof startChild> | null | undefined;
        let worker: ReturnType<typeof startChild> | null | undefined;
        let queue: QueueClient | undefined;
        let queueEvents: QueueEventsClient | undefined;
        let sampling: Promise<void> | undefined;
        let monitorError = false;
        let blocker: Promise<void> | undefined;
        let monitoring = false;
        await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        try {
          const url = new URL(process.env.INBOUND_TEST_DATABASE_URL);
          url.searchParams.set("schema", schema);
          // Equal pool ceilings make the before/after comparison bounded and fair.
          url.searchParams.set("connection_limit", "5");
          url.searchParams.set("pool_timeout", "5");
          const cli = apiRequire.resolve("prisma/build/index.js");
          const migrated = spawnSync(
            process.execPath,
            [
              cli,
              "migrate",
              "deploy",
              "--config",
              resolve(checkout, "apps/api/prisma.config.ts"),
            ],
            {
              cwd: resolve(checkout, "apps/api"),
              env: { ...process.env, DATABASE_URL: url.toString() },
              encoding: "utf8",
              timeout: 60000,
            },
          );
          if (migrated.status !== 0)
            throw new Error("Load schema migration failed");
          const fixtureUrl = new URL(url);
          fixtureUrl.searchParams.set("connection_limit", "1");
          fixtureUrl.searchParams.set(
            "application_name",
            "omnidesk-load-fixtures",
          );
          client = new PrismaClient({
            datasourceUrl: fixtureUrl.toString(),
            log: [],
          });
          const mailbox = "load@support.invalid";
          const account = await client.channelAccount.create({
            data: {
              type: ChannelAccountType.EMAIL,
              externalId: mailbox,
              displayName: "Load fixture",
              configJson: {},
            },
          });
          const conversations: Conversation[] = [];
          for (let i = 0; i < 4; i++) {
            const customer = await client.customer.create({
              data: {
                email: `load${i}@customer.invalid`,
                name: "Synthetic load",
              },
            });
            conversations.push(
              await client.conversation.create({
                data: {
                  channelType: ChannelType.EMAIL,
                  channelAccountId: account.id,
                  customerId: customer.id,
                  externalConversationId: `EMAIL:${mailbox}:thread${i}`,
                  subject: "Synthetic load",
                  status: ConversationStatus.IN_PROGRESS,
                  lastMessageAt: new Date(),
                  ticket: {
                    create: { slaDueAt: new Date(Date.now() + 86400000) },
                  },
                },
              }),
            );
          }
          const events = [];
          for (let i = 0; i < 120; i++)
            events.push(
              await client.inboundEvent.create({
                data: {
                  provider: InboundProvider.EMAIL,
                  eventType: InboundEventType.EMAIL_RECEIVED,
                  dedupKey: `${prefix}:${i}`,
                  rawPayload: {
                    mailbox,
                    messageId: `${prefix}:${i}`,
                    fromEmail: `load${i % 4}@customer.invalid`,
                    fromName: "Synthetic load",
                    subject: "Synthetic load",
                    text: "Synthetic message",
                    receivedAt: new Date().toISOString(),
                    threadId: `thread${i % 4}`,
                  },
                },
              }),
            );
          queue = new Queue("inbound-events", { connection: redis, prefix });
          queueEvents = new QueueEvents("inbound-events", {
            connection: redis,
            prefix,
          });
          const activeQueueEvents = queueEvents;
          await queueEvents.waitUntilReady();
          const apiUrl = new URL(url);
          apiUrl.searchParams.set(
            "application_name",
            `omnidesk-api:${instance}`,
          );
          const workerUrl = new URL(url);
          workerUrl.searchParams.set(
            "application_name",
            `omnidesk-worker:${instance}`,
          );
          api = startChild(
            "api",
            checkout,
            apiUrl.toString(),
            prefix,
            concurrency,
            instance,
          );
          worker = startChild(
            "worker",
            checkout,
            workerUrl.toString(),
            prefix,
            concurrency,
            instance,
          );
          const [{ address }] = await Promise.all([api.ready, worker.ready]);
          if (!address) throw new Error("Missing API load address");
          const request = async (path: string, options?: RequestInit) => {
            const started = performance.now();
            const response = await fetch(
              `${address}/api/v1/conversations${path}`,
              { ...options, signal: AbortSignal.timeout(10000) },
            );
            const body = await response.json();
            return {
              status: response.status,
              body,
              ms: performance.now() - started,
            };
          };
          // Warm both read paths without measuring startup/compilation.
          await request(`/${conversations[0].id}`);
          const maxima = {
            api: 0,
            worker: 0,
            blockedSessions: 0,
            idleInTransaction: 0,
            longestTransactionMs: 0,
          };
          let samples = 0;
          let blockedSamples = 0;
          const [statsBefore] = await admin.$queryRaw<
            { deadlocks: number }[]
          >`SELECT deadlocks::int AS deadlocks FROM pg_stat_database WHERE datname = current_database()`;
          monitoring = true;
          sampling = (async () => {
            while (monitoring) {
              const rows = await admin.$queryRaw<
                {
                  application_name: string;
                  connections: number;
                  blocked: number;
                  idle: number;
                  age: number;
                }[]
              >`SELECT application_name, count(*)::int AS connections,
                count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid)) > 0)::int AS blocked,
                count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle,
                coalesce(max(EXTRACT(EPOCH FROM (clock_timestamp() - xact_start)) * 1000), 0)::float AS age
                FROM pg_stat_activity WHERE application_name IN (${`omnidesk-api:${instance}`}, ${`omnidesk-worker:${instance}`}) GROUP BY application_name`;
              samples++;
              let blocked = 0;
              let idle = 0;
              for (const row of rows) {
                const role = row.application_name.startsWith("omnidesk-api:")
                  ? "api"
                  : "worker";
                maxima[role] = Math.max(maxima[role], row.connections);
                blocked += row.blocked;
                idle += row.idle;
                maxima.longestTransactionMs = Math.max(
                  maxima.longestTransactionMs,
                  row.age,
                );
              }
              maxima.blockedSessions = Math.max(
                maxima.blockedSessions,
                blocked,
              );
              maxima.idleInTransaction = Math.max(
                maxima.idleInTransaction,
                idle,
              );
              if (blocked) blockedSamples++;
              await pause(20);
            }
          })().catch(() => {
            monitorError = true;
          });
          // Identical deliberate contention in both generations, on synthetic data.
          let acquired!: () => void;
          const ready = new Promise<void>((done) => {
            acquired = done;
          });
          blocker = client.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${conversations[0].id}::uuid FOR UPDATE`;
            acquired();
            await pause(1200);
          });
          await ready;
          const started = performance.now();
          const reads: number[] = [];
          const writes: number[] = [];
          const statuses: Record<number, number> = {};
          const jobs = await queue.addBulk(
            events.map((event) => ({
              name: "load-inbound",
              data: {
                inboundEventId: event.id,
                provider: InboundProvider.EMAIL,
                eventType: InboundEventType.EMAIL_RECEIVED,
                dedupKey: event.dedupKey,
              },
              opts: {
                attempts: 4,
                backoff: { type: "exponential", delay: 100 },
              },
            })),
          );
          // waitUntilFinished adds one closing listener per pending job. This
          // finite batch is intentional, not an accumulating listener leak.
          queue.setMaxListeners(jobs.length + 10);
          const traffic = Promise.all(
            Array.from({ length: 4 }, async (_, lane) => {
              for (let i = 0; i < 30; i++) {
                const id = conversations[(i + lane) % 4].id;
                const read = await request(`/${id}`);
                reads.push(read.ms);
                statuses[read.status] = (statuses[read.status] ?? 0) + 1;
                if (read.status !== 200) throw new Error("Load read failed");
                if (i % 2 === 0) {
                  const write = await request(`/${id}/priority`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      version: read.body.data.version,
                      priority: i % 4 ? Priority.HIGH : Priority.LOW,
                    }),
                  });
                  writes.push(write.ms);
                  statuses[write.status] = (statuses[write.status] ?? 0) + 1;
                }
              }
            }),
          );
          await Promise.all([
            traffic,
            Promise.all(
              jobs.map((job) =>
                job.waitUntilFinished(activeQueueEvents, 30000),
              ),
            ),
            blocker,
          ]);
          monitoring = false;
          await sampling;
          const elapsedMs = performance.now() - started;
          const apiMetrics = await api.stop();
          api = null;
          const workerMetrics = await worker.stop();
          worker = null;
          const counts = await queue.getJobCounts("failed", "completed");
          const [statsAfter] = await admin.$queryRaw<
            { deadlocks: number }[]
          >`SELECT deadlocks::int AS deadlocks FROM pg_stat_database WHERE datname = current_database()`;
          const processed = await client.inboundEvent.count({
            where: { normalizedStatus: InboundEventStatus.PROCESSED },
          });
          const messages = await client.message.count();
          const result = {
            round,
            phase,
            workerConcurrency: concurrency,
            poolCeilingPerProcess: 5,
            elapsedMs: Number(elapsedMs.toFixed(2)),
            api: {
              reads: summary(reads),
              writes: summary(writes),
              statuses,
              ...apiMetrics,
            },
            worker: workerMetrics,
            sessions: {
              samples,
              blockedSamples,
              ...maxima,
              longestTransactionMs: Number(
                maxima.longestTransactionMs.toFixed(2),
              ),
            },
            deadlockDelta: statsAfter.deadlocks - statsBefore.deadlocks,
            jobs: counts,
            processed,
            messages,
          };
          if (
            monitorError ||
            samples === 0 ||
            maxima.api === 0 ||
            maxima.worker === 0 ||
            processed !== 120 ||
            messages !== 120 ||
            counts.failed ||
            maxima.api > 5 ||
            maxima.worker > 5 ||
            Object.keys(apiMetrics.failures).some(
              (category) =>
                !["version_conflict", "lock_timeout"].includes(category),
            ) ||
            (phase === "after" &&
              Object.keys(workerMetrics.failures).some(
                (category) =>
                  !["lock_timeout", "pool_timeout", "write_conflict"].includes(
                    category,
                  ),
              ))
          )
            throw new Error("Load acceptance invariant failed");
          results.push(result);
          console.log(JSON.stringify(result));
        } finally {
          monitoring = false;
          await sampling;
          // Await process exit before removing only this run's owned schema/queue.
          for (const runtime of [api, worker])
            if (runtime) {
              try {
                await runtime.stop();
              } catch {
                runtime.child.kill();
                await new Promise((done) => runtime.child.once("exit", done));
              }
            }
          await blocker;
          if (queue) {
            await queue.obliterate({ force: false });
            await queue.close();
          }
          await queueEvents?.close();
          await client?.$disconnect();
          if (!/^db_load_[a-f0-9]{32}_[1-3]_(before|after)$/.test(schema))
            throw new Error("Unsafe load schema cleanup");
          await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        }
      }
    }
    mkdirSync(resolve(root, "test-results"), { recursive: true });
    const report = {
      base,
      current: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      workingTree: true,
      node: process.version,
      platform: process.platform,
      server,
      rounds: 3,
      fixture: {
        conversations: 4,
        inboundJobs: 120,
        apiReaders: 4,
        reads: 120,
        priorityWrites: 60,
        blockerMs: 1200,
      },
      results,
    };
    writeFileSync(
      resolve(root, "test-results/database-load.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  } finally {
    await redis.quit();
    await admin.$disconnect();
  }
}

(process.argv[2] === "child" ? child() : main()).catch((error) => {
  // Do not forward driver errors, URLs, SQL parameters or customer payloads.
  console.error(
    `Database load experiment failed (${classifyDatabaseError(error)}).`,
  );
  process.exitCode = 1;
  if (process.argv[2] === "child") process.exit(1);
});
