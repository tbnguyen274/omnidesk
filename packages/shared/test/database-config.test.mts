import test from "node:test";
import assert from "node:assert/strict";
import {
  databaseRuntimeConfig,
  positiveInteger,
  observeDatabaseOperation,
  classifyDatabaseError,
  type DatabaseObservation,
} from "../dist/database-config.js";

test("runtime pool settings preserve schema, SSL and explicit test URL options", () => {
  const result = databaseRuntimeConfig(
    "worker",
    {
      DATABASE_URL: "postgresql://ignored/db",
      INSTANCE_ID: "test instance",
      WORKER_DB_POOL_SIZE: "7",
    },
    "postgresql://test:secret@localhost/db?schema=isolated&sslmode=require&connection_limit=99&options=-c%20search_path%3Dcustom",
  );
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("schema"), "isolated");
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.get("connection_limit"), "7");
  assert.equal(url.searchParams.get("pool_timeout"), "5");
  assert.equal(
    url.searchParams.get("application_name"),
    "omnidesk-worker:test_instance",
  );
  assert.match(
    url.searchParams.get("options") ?? "",
    /search_path=custom.*lock_timeout=1000.*statement_timeout=5000.*idle_in_transaction_session_timeout=10000/,
  );
  assert.deepEqual(result.transactionOptions, { maxWait: 2000, timeout: 5000 });
});

test("database failures are classified by structured Prisma and SQLSTATE codes", () => {
  for (const [error, category] of [
    [{ code: "P2024" }, "pool_timeout"],
    [{ code: "P2028" }, "transaction_timeout"],
    [{ code: "P2010", meta: { code: "55P03" } }, "lock_timeout"],
    [{ code: "P2010", meta: { code: "57014" } }, "statement_timeout"],
    [{ code: "P2034" }, "write_conflict"],
    [{ code: "40P01" }, "write_conflict"],
    [{ code: "P2002" }, "other"],
    [new Error("pool timeout containing customer content"), "other"],
    [null, "other"],
  ])
    assert.equal(classifyDatabaseError(error), category);
});

test("invalid limits fail fast without echoing a connection string", () => {
  for (const value of [
    "0",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    "1e2",
    "9007199254740992",
  ])
    assert.throws(
      () => positiveInteger(value, 5, "LIMIT"),
      /LIMIT must be a positive integer/,
    );
  assert.equal(positiveInteger(undefined, 5, "LIMIT"), 5);
  assert.throws(
    () => databaseRuntimeConfig("api", {}),
    /DATABASE_URL is required/,
  );
});

test("invalid URL errors do not retain credentials or the original URL input", () => {
  try {
    databaseRuntimeConfig("api", {
      DATABASE_URL: "postgresql://test:secret@[broken/db",
    });
    assert.fail("Expected an invalid URL error");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Invalid PostgreSQL DATABASE_URL");
    assert.equal("input" in error ? error.input : undefined, undefined);
    assert.doesNotMatch(String(error), /secret/);
  }
});

test("transaction observations expose duration and error code, never SQL or parameters", async () => {
  const records: DatabaseObservation[] = [];
  assert.equal(
    await observeDatabaseOperation(
      "test",
      async () => 42,
      (record) => records.push(record),
    ),
    42,
  );
  const error = Object.assign(new Error("SELECT secret_customer_data"), {
    code: "P2028",
  });
  await assert.rejects(
    observeDatabaseOperation(
      "test",
      async () => {
        throw error;
      },
      (record) => records.push(record),
    ),
    error,
  );
  assert.equal(records[0].outcome, "committed");
  assert.equal(records[1].errorCode, "P2028");
  assert.ok(records.every((record) => record.durationMs >= 0));
  assert.doesNotMatch(JSON.stringify(records), /SELECT|secret_customer_data/);
});
