import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  validateExpandSql,
  validateMetadata,
  checkMigrations,
} from "../check-migrations.mts";

test("expand allows nullable additions and ignores strings/comments", () => {
  validateExpandSql(
    `-- DROP TABLE x\nALTER TABLE "tickets" ADD COLUMN "note" TEXT; CREATE TABLE "new" (id UUID NOT NULL, note TEXT DEFAULT 'DROP TABLE');`,
  );
});
test("expand rejects destructive, required, type and opaque changes", () => {
  for (const sql of [
    "DROP TABLE tickets;",
    "ALTER TABLE tickets RENAME COLUMN a TO b;",
    "ALTER TABLE tickets ALTER COLUMN a TYPE INT;",
    "ALTER TABLE tickets ADD COLUMN x TEXT NOT NULL;",
    "ALTER TABLE tickets ALTER COLUMN x SET NOT NULL;",
    "TRUNCATE tickets;",
    "DO $$ BEGIN EXECUTE dangerous; END $$;",
    "CREATE FUNCTION unsafe() RETURNS void LANGUAGE sql AS 'DROP TABLE tickets';",
  ])
    assert.throws(() => validateExpandSql(sql));
});
test("expand rejects constraints in index, table and inline-column forms", () => {
  for (const sql of [
    "CREATE UNIQUE INDEX customer_name_unique ON customers(name);",
    "CREATE /* concurrent rollout */ UNIQUE INDEX CONCURRENTLY IF NOT EXISTS x ON customers(name);",
    "ALTER TABLE customers ADD PRIMARY KEY (name);",
    'ALTER TABLE customers ADD CONSTRAINT "customer name unique" UNIQUE(name);',
    "ALTER TABLE tickets ADD COLUMN new_fk UUID REFERENCES customers(id);",
    "ALTER TABLE tickets ADD COLUMN note TEXT CHECK (length(note) > 0);",
    "ALTER TABLE tickets ADD COLUMN note TEXT UNIQUE;",
    "ALTER TABLE tickets ADD EXCLUDE USING gist (id WITH =);",
    "-- a comment with an apostrophe ' \nCREATE UNIQUE INDEX x ON customers(name); -- another '",
    "/* outer /* inner */ comment */ CREATE UNIQUE INDEX x ON customers(name);",
  ])
    assert.throws(() => validateExpandSql(sql), Error, sql);
  validateExpandSql(
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS x ON customers(name);",
  );
  validateExpandSql(
    "CREATE TABLE new_table (id UUID PRIMARY KEY, customer_id UUID REFERENCES customers(id));",
  );
});

test("guard tokenization handles quoted identifiers, nested comments and incomplete SQL", () => {
  validateExpandSql(
    '/* outer /* CREATE UNIQUE INDEX */ end */ ALTER TABLE "tickets" ADD COLUMN "unique" TEXT;',
  );
  validateExpandSql(
    "ALTER TABLE tickets ADD COLUMN note TEXT DEFAULT 'customer''s note; -- no DDL';",
  );
  for (const sql of [
    "/* unclosed",
    "ALTER TABLE tickets ADD COLUMN x TEXT DEFAULT 'unclosed",
    'ALTER TABLE "unclosed',
    "SELECT E'escaped\\\\value';",
  ])
    assert.throws(() => validateExpandSql(sql));
});

test("metadata requires compatibility for both process generations and an actionable rollback", () => {
  const meta = {
    phase: "expand",
    compatibleWith: { api: ["base", "current"], worker: ["base", "current"] },
    backfill: { required: false, procedure: "No backfill." },
    rollback: {
      application: "Redeploy base.",
      schema: "Leave additive schema in place.",
    },
    contractAfter: "Separate PR after old replicas and retries have drained.",
  };
  validateMetadata(meta);
  assert.throws(() => validateMetadata({ ...meta, phase: "contract" }));
  assert.throws(() =>
    validateMetadata({
      ...meta,
      compatibleWith: { api: ["current"], worker: ["current"] },
    }),
  );
});
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

test("history is immutable with Git newline normalization and new migrations require metadata", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "omnidesk-migration-guard-"),
  );
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  const migrations = path.join(root, "apps/api/prisma/migrations");
  const old = path.join(migrations, "20260101000000_initial/migration.sql");
  const initial = "CREATE TABLE initial (id INT);\n";
  try {
    git("init", "--quiet");
    git("config", "core.autocrlf", "true");
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.writeFileSync(old, initial);
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@omnidesk.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    const base = git("rev-parse", "HEAD");
    fs.writeFileSync(old, initial.replaceAll("\n", "\r\n"));
    assert.deepEqual(checkMigrations(base, root), []);
    fs.writeFileSync(old, `${initial}DROP TABLE initial;\n`);
    assert.throws(
      () => checkMigrations(base, root),
      /Historical migration is immutable/,
    );
    fs.writeFileSync(old, initial);
    const directory = path.join(migrations, "20260102000000_optional_note");
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, "migration.sql"),
      "ALTER TABLE initial ADD COLUMN note TEXT;",
    );
    assert.throws(() => checkMigrations(base, root), /migration.json/);
    fs.writeFileSync(
      path.join(directory, "migration.json"),
      JSON.stringify({
        phase: "expand",
        compatibleWith: {
          api: ["base", "current"],
          worker: ["base", "current"],
        },
        backfill: { required: false, procedure: "None." },
        rollback: { application: "Base images.", schema: "Keep expansion." },
        contractAfter: "After old clients drain.",
      }),
    );
    assert.deepEqual(checkMigrations(base, root), [
      "20260102000000_optional_note",
    ]);
    fs.unlinkSync(old);
    assert.throws(
      () => checkMigrations(base, root),
      /Historical migration is immutable/,
    );
  } finally {
    const resolved = path.resolve(root);
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith("omnidesk-migration-guard-")
    )
      throw new Error("Unsafe temporary fixture cleanup");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
