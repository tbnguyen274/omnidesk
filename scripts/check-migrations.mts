import { isMainModule } from "./lib/entrypoint.mts";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
const migrationsPath = "apps/api/prisma/migrations";

// Scan tokens in order so quotes inside comments cannot hide later DDL.
function sqlForGuard(sql: string): string {
  let text = "";
  for (let index = 0; index < sql.length; ) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2);
      index = end < 0 ? sql.length : end;
      text += " ";
    } else if (sql.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith("/*", index)) {
          depth++;
          index += 2;
        } else if (sql.startsWith("*/", index)) {
          depth--;
          index += 2;
        } else index++;
      }
      if (depth) throw new Error("Unterminated SQL comment");
      text += " ";
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index++];
      let closed = false;
      while (index < sql.length) {
        if (quote === "'" && sql[index] === "\\")
          throw new Error(
            "Escaped SQL strings need an explicit compatibility review outside expand",
          );
        if (sql[index++] === quote) {
          if (sql[index] === quote) index++;
          else {
            closed = true;
            break;
          }
        }
      }
      if (!closed) throw new Error("Unterminated SQL quote");
      text += quote === "'" ? " '' " : " IDENTIFIER ";
    } else {
      const dollar =
        sql[index] === "$" &&
        sql.slice(index).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
      if (dollar)
        throw new Error(
          "Opaque dollar-quoted SQL needs a separate reviewed migration phase",
        );
      text += sql[index++];
    }
  }
  return text;
}

// Conservative lexical guard, followed by human review and runtime compatibility CI.
function validateExpandSql(sql: string): void {
  const text = sqlForGuard(sql);
  if (/\b(DROP|RENAME|TRUNCATE|DELETE)\b/i.test(text))
    throw new Error(
      "Destructive DDL/data removal is forbidden in an expand migration",
    );
  if (/\b(DO|EXECUTE|FUNCTION|PROCEDURE|TRIGGER|RULE)\b/i.test(text))
    throw new Error(
      "Opaque procedural/dynamic SQL needs a separate reviewed migration phase",
    );
  for (const statement of text.split(";")) {
    // A unique index tightens writes just like a UNIQUE constraint. Runtime
    // smoke fixtures cannot prove that all previously valid writes still work.
    if (/\bCREATE\s+UNIQUE\s+INDEX\b/i.test(statement))
      throw new Error(
        "Unique indexes require a separate compatibility review outside expand",
      );
    if (
      /\bALTER\s+TABLE\b/i.test(statement) &&
      /\b(TYPE|NOT\s+NULL|SET\s+DEFAULT|CHECK|UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|REFERENCES|EXCLUDE)\b/i.test(
        statement,
      )
    )
      throw new Error(
        "Table type/required-column/constraint/default changes need an explicit compatibility review outside expand",
      );
  }
}
export interface MigrationMetadata {
  phase: "expand";
  compatibleWith: { api: string[]; worker: string[] };
  backfill: { required: boolean; procedure: string };
  rollback: { application: string; schema: string };
  contractAfter: string;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Migration metadata sections must be objects");
  return value as Record<string, unknown>;
}

function validateMetadata(input: unknown): asserts input is MigrationMetadata {
  const meta = metadataRecord(input);
  if (meta.phase !== "expand")
    throw new Error("Only expand migrations are allowed in this phase");
  const compatibility = metadataRecord(meta.compatibleWith);
  for (const runtime of ["api", "worker"]) {
    const versions = compatibility[runtime];
    if (
      !Array.isArray(versions) ||
      !versions.every((version: unknown) => typeof version === "string") ||
      !["base", "current"].every((version) => versions.includes(version))
    )
      throw new Error(
        `compatibleWith.${runtime} must include base and current`,
      );
  }
  const backfill = metadataRecord(meta.backfill);
  if (
    typeof backfill.required !== "boolean" ||
    typeof backfill.procedure !== "string" ||
    !backfill.procedure.trim()
  )
    throw new Error("Backfill requirement and procedure are required");
  const rollback = metadataRecord(meta.rollback);
  for (const field of ["application", "schema"])
    if (typeof rollback[field] !== "string" || !rollback[field].trim())
      throw new Error(`rollback.${field} is required`);
  if (typeof meta.contractAfter !== "string" || !meta.contractAfter.trim())
    throw new Error(
      "contractAfter must describe a later, separate cleanup gate",
    );
}
function checkMigrations(
  base: string | undefined,
  root = path.resolve(import.meta.dirname, ".."),
): string[] {
  if (!base || !/^[a-f0-9]{7,40}$/i.test(base))
    throw new Error("Pass an explicit trusted base commit SHA");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("cat-file", "-e", `${base}^{commit}`);
  const tracked = git(
    "ls-tree",
    "-r",
    "--name-only",
    base,
    "--",
    migrationsPath,
  )
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const file of tracked) {
    if (
      !fs.existsSync(path.join(root, file)) ||
      git("rev-parse", `${base}:${file}`).toString().trim() !==
        git("hash-object", `--path=${file}`, file).toString().trim()
    )
      throw new Error(`Historical migration is immutable: ${file}`);
  }
  const historical = new Set(
    tracked
      .filter((file) => file.endsWith("/migration.sql"))
      .map((file) => file.split("/").at(-2)),
  );
  const added = [];
  for (const folder of fs
    .readdirSync(path.join(root, migrationsPath), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())) {
    if (historical.has(folder.name)) continue;
    if (!/^\d{14}_[a-z0-9_]+$/.test(folder.name))
      throw new Error(`Invalid migration directory: ${folder.name}`);
    const directory = path.join(root, migrationsPath, folder.name);
    validateMetadata(
      JSON.parse(
        fs.readFileSync(path.join(directory, "migration.json"), "utf8"),
      ),
    );
    validateExpandSql(
      fs.readFileSync(path.join(directory, "migration.sql"), "utf8"),
    );
    added.push(folder.name);
  }
  return added;
}
export { checkMigrations, validateExpandSql, validateMetadata };
if (isMainModule(import.meta.url)) {
  try {
    const base = process.argv[2] || process.env.MIGRATION_BASE_SHA;
    const added = checkMigrations(base);
    console.log(
      JSON.stringify({
        action: "migration_check",
        phase: "expand",
        newMigrations: added,
      }),
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Migration check failed",
    );
    process.exitCode = 1;
  }
}
