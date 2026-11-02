import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { checkMigrations } from "./check-migrations.mts";
import { loadPrisma } from "./lib/prisma-runtime.mts";

async function main() {
  const base = process.argv[2] || process.env.MIGRATION_BASE_SHA;
  const baseRoot = resolve(process.argv[3] || "");
  const root = resolve(import.meta.dirname, "..");
  checkMigrations(base, root);
  if (
    baseRoot === root ||
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: baseRoot,
      encoding: "utf8",
    }).trim() !== base
  )
    throw new Error(
      "Provide a separately built checkout at the exact base SHA",
    );
  const databaseUrl = process.env.SCHEMA_TEST_DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      "Set SCHEMA_TEST_DATABASE_URL explicitly; the runner creates isolated schemas only",
    );
  const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
  const { PrismaClient } = loadPrisma(apiRequire);
  const cli = apiRequire.resolve("prisma/build/index.js");
  const adminUrl = new URL(databaseUrl);
  adminUrl.searchParams.set("connection_limit", "1");
  const admin = new PrismaClient({
    datasourceUrl: adminUrl.toString(),
    log: [],
  });
  const created: string[] = [];
  const run = (
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    phase: string,
  ) => {
    const result = spawnSync(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 120000,
    });
    if (result.status !== 0)
      throw new Error(`${phase} failed (database details suppressed)`);
  };
  const migrate = (checkout: string, url: string, phase: string) =>
    run(
      [
        cli,
        "migrate",
        "deploy",
        "--config",
        resolve(checkout, "apps/api/prisma.config.ts"),
      ],
      resolve(checkout, "apps/api"),
      { DATABASE_URL: url },
      phase,
    );
  const smoke = (checkout: string, url: string, phase: string) =>
    run(
      [
        "--experimental-strip-types",
        resolve(root, "scripts/runtime-schema-smoke.mts"),
        checkout,
      ],
      checkout,
      { COMPAT_DATABASE_URL: url, DATABASE_URL: url },
      phase,
    );
  try {
    for (const scenario of ["clean", "upgrade"]) {
      const schema = `schema_compat_${scenario}_${randomUUID().replaceAll("-", "")}`;
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      created.push(schema);
      const url = new URL(databaseUrl);
      url.searchParams.set("schema", schema);
      if (scenario === "upgrade") {
        migrate(baseRoot, url.toString(), "Base schema creation");
        smoke(baseRoot, url.toString(), "Base runtime before expansion");
      }
      const [before] =
        scenario === "upgrade"
          ? await admin.$queryRawUnsafe<{ count: number }[]>(
              `SELECT count(*)::int AS count FROM "${schema}"."conversations"`,
            )
          : [{ count: 0 }];
      migrate(root, url.toString(), "Current schema migration");
      const [after] = await admin.$queryRawUnsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM "${schema}"."conversations"`,
      );
      if (before.count !== after.count)
        throw new Error(
          "Expansion did not preserve existing conversation rows",
        );
      smoke(baseRoot, url.toString(), "Base API/Worker on expanded schema");
      smoke(root, url.toString(), "Current API/Worker on expanded schema");
      console.log(
        `${scenario}: migrations and both generations of API/Worker passed`,
      );
    }
  } finally {
    for (const schema of created) {
      if (!/^schema_compat_(clean|upgrade)_[a-f0-9]{32}$/.test(schema))
        throw new Error("Refusing unsafe schema cleanup");
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Schema compatibility failed",
  );
  process.exitCode = 1;
});
