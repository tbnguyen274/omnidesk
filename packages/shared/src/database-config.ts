export type DatabaseService = "api" | "worker";
export type DatabaseEnvironment = Record<string, string | undefined>;

export function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === "") return fallback;
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  ) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

/** Explicit process settings own pool/timeouts; all unrelated URL options survive. */
export function databaseRuntimeConfig(
  service: DatabaseService,
  env: DatabaseEnvironment,
  overrideUrl?: string,
) {
  const prefix = service.toUpperCase();
  const poolSize = positiveInteger(
    env[`${prefix}_DB_POOL_SIZE`],
    5,
    `${prefix}_DB_POOL_SIZE`,
  );
  const poolTimeout = positiveInteger(
    env.DB_POOL_TIMEOUT_SECONDS,
    5,
    "DB_POOL_TIMEOUT_SECONDS",
  );
  const maxWait = positiveInteger(
    env.DB_TRANSACTION_MAX_WAIT_MS,
    2000,
    "DB_TRANSACTION_MAX_WAIT_MS",
  );
  const timeout = positiveInteger(
    env.DB_TRANSACTION_TIMEOUT_MS,
    5000,
    "DB_TRANSACTION_TIMEOUT_MS",
  );
  const lockTimeout = positiveInteger(
    env.DB_LOCK_TIMEOUT_MS,
    1000,
    "DB_LOCK_TIMEOUT_MS",
  );
  const statementTimeout = positiveInteger(
    env.DB_STATEMENT_TIMEOUT_MS,
    5000,
    "DB_STATEMENT_TIMEOUT_MS",
  );
  const idleTimeout = positiveInteger(
    env.DB_IDLE_TRANSACTION_TIMEOUT_MS,
    10000,
    "DB_IDLE_TRANSACTION_TIMEOUT_MS",
  );
  const base = overrideUrl ?? env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is required");
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("Invalid PostgreSQL DATABASE_URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("PostgreSQL DATABASE_URL required");
  const instance = (env.INSTANCE_ID ?? env.HOSTNAME ?? "local")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .slice(0, 40);
  url.searchParams.set("application_name", `omnidesk-${service}:${instance}`);
  url.searchParams.set("connection_limit", String(poolSize));
  url.searchParams.set("pool_timeout", String(poolTimeout));
  const options = url.searchParams.get("options") ?? "";
  url.searchParams.set(
    "options",
    `${options} -c lock_timeout=${lockTimeout} -c statement_timeout=${statementTimeout} -c idle_in_transaction_session_timeout=${idleTimeout}`.trim(),
  );
  return {
    url: url.toString(),
    poolSize,
    poolTimeout,
    transactionOptions: { maxWait, timeout },
  };
}

export interface DatabaseObservation {
  action: "db_transaction";
  operation: string;
  durationMs: number;
  outcome: "committed" | "failed";
  errorCode?: string;
  errorCategory?: ReturnType<typeof classifyDatabaseError>;
}

/** Classify structured driver codes only; never inspect or log error messages. */
export function classifyDatabaseError(
  error: unknown,
):
  | "pool_timeout"
  | "transaction_timeout"
  | "lock_timeout"
  | "statement_timeout"
  | "write_conflict"
  | "other" {
  if (!error || typeof error !== "object") return "other";
  const { code, meta } = error as { code?: unknown; meta?: { code?: unknown } };
  const sqlState = meta?.code ?? code;
  if (code === "P2024") return "pool_timeout";
  if (code === "P2028") return "transaction_timeout";
  if (sqlState === "55P03") return "lock_timeout";
  if (sqlState === "57014") return "statement_timeout";
  if (code === "P2034" || sqlState === "40001" || sqlState === "40P01")
    return "write_conflict";
  return "other";
}

/** Never include database error messages: they can contain SQL or customer data. */
export async function observeDatabaseOperation<T>(
  operation: string,
  run: () => Promise<T>,
  emit: (record: DatabaseObservation) => void,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    emit({
      action: "db_transaction",
      operation,
      durationMs: Date.now() - started,
      outcome: "committed",
    });
    return result;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "UNKNOWN";
    emit({
      action: "db_transaction",
      operation,
      durationMs: Date.now() - started,
      outcome: "failed",
      errorCode: /^[A-Z0-9]{5,8}$/.test(code) ? code : "UNKNOWN",
      errorCategory: classifyDatabaseError(error),
    });
    throw error;
  }
}
