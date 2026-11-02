import { isMainModule } from "./lib/entrypoint.mts";
import { createRequire } from "node:module";
import * as path from "node:path";
import { loadPrisma } from "./lib/prisma-runtime.mts";

export interface ConnectionBudgetInput {
  maxConnections: number;
  serverReserved: number;
  apiPool: number;
  workerPool: number;
  apiReplicas: number;
  workerReplicas: number;
  apiSurge: number;
  workerSurge: number;
  toolConnections: number;
}

function connectionBudget(input: ConnectionBudgetInput) {
  const reserve = Math.ceil(input.maxConnections * 0.2);
  const application =
    (input.apiReplicas + input.apiSurge) * input.apiPool +
    (input.workerReplicas + input.workerSurge) * input.workerPool;
  const required =
    application + input.toolConnections + reserve + input.serverReserved;
  return {
    ...input,
    reserve,
    application,
    required,
    available: input.maxConnections,
    fits: required <= input.maxConnections,
  };
}
function nonNegative(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`${name} must be a non-negative integer`);
  return Number(value);
}
async function main() {
  const { positiveInteger } =
    await import("../packages/shared/dist/database-config.js");

  const apiRequire = createRequire(
    path.resolve(import.meta.dirname, "../apps/api/package.json"),
  );
  const { PrismaClient } = loadPrisma(apiRequire);
  const mode = process.argv[2];
  if (!["inspect", "budget"].includes(mode))
    throw new Error("Usage: database-operations.mts inspect|budget");
  const raw = process.env.DB_MONITOR_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw)
    throw new Error("Set DB_MONITOR_DATABASE_URL or DATABASE_URL explicitly");
  const url = new URL(raw);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "5");
  url.searchParams.set("application_name", "omnidesk-diagnostics");
  const prisma = new PrismaClient({ datasourceUrl: url.toString(), log: [] });
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3s'");
        if (mode === "budget") {
          const [settings] = await tx.$queryRaw<
            { max: number; reserved: number }[]
          >`SELECT current_setting('max_connections')::int AS max, (current_setting('superuser_reserved_connections')::int + coalesce(current_setting('reserved_connections', true), '0')::int) AS reserved`;
          return connectionBudget({
            maxConnections: settings.max,
            serverReserved: settings.reserved,
            apiPool: positiveInteger(
              process.env.API_DB_POOL_SIZE,
              5,
              "API_DB_POOL_SIZE",
            ),
            workerPool: positiveInteger(
              process.env.WORKER_DB_POOL_SIZE,
              5,
              "WORKER_DB_POOL_SIZE",
            ),
            apiReplicas: positiveInteger(
              process.env.API_REPLICAS,
              1,
              "API_REPLICAS",
            ),
            workerReplicas: positiveInteger(
              process.env.WORKER_REPLICAS,
              1,
              "WORKER_REPLICAS",
            ),
            apiSurge: nonNegative(
              process.env.API_SURGE_REPLICAS,
              1,
              "API_SURGE_REPLICAS",
            ),
            workerSurge: nonNegative(
              process.env.WORKER_SURGE_REPLICAS,
              1,
              "WORKER_SURGE_REPLICAS",
            ),
            toolConnections: positiveInteger(
              process.env.DB_TOOL_CONNECTIONS,
              2,
              "DB_TOOL_CONNECTIONS",
            ),
          });
        }
        const sessions =
          await tx.$queryRaw`SELECT application_name, state, wait_event_type, count(*)::int AS connections FROM pg_stat_activity WHERE datname = current_database() GROUP BY application_name, state, wait_event_type ORDER BY application_name, state`;
        const transactions =
          await tx.$queryRaw`SELECT pid, application_name, state, wait_event_type, wait_event, EXTRACT(EPOCH FROM (clock_timestamp() - xact_start))::float AS transaction_seconds, pg_blocking_pids(pid) AS blocked_by FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND (xact_start IS NOT NULL OR cardinality(pg_blocking_pids(pid)) > 0) ORDER BY xact_start NULLS LAST`;
        const locks =
          await tx.$queryRaw`SELECT a.application_name, l.locktype, l.mode, l.granted, count(*)::int AS locks FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.datname = current_database() GROUP BY a.application_name, l.locktype, l.mode, l.granted`;
        const database =
          await tx.$queryRaw`SELECT numbackends, xact_commit::text, xact_rollback::text, deadlocks::text, conflicts::text, temp_files::text, temp_bytes::text FROM pg_stat_database WHERE datname = current_database()`;
        return { sessions, transactions, locks, database };
      },
      { maxWait: 2000, timeout: 5000 },
    );
    console.log(JSON.stringify(result, null, 2));
    if (mode === "budget" && "fits" in result && !result.fits)
      process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
export { connectionBudget, nonNegative };
if (isMainModule(import.meta.url))
  main().catch(() => {
    console.error(
      "Database operation failed. Check connectivity, limits and monitoring permissions; connection details are suppressed.",
    );
    process.exitCode = 1;
  });
