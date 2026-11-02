# TypeScript ESM tooling

All scripts in this directory and the Node tests in `packages/domain/test` and `packages/shared/test` use `.mts`: TypeScript with an explicit ESM module format. Use the existing Node 22 runtime (the local validation baseline is 22.23.1). Commands pass `--experimental-strip-types`; no extra runtime loader or new dependency is needed.

Node removes erasable type syntax when executing these files. It does not typecheck them. `scripts/tsconfig.json` checks the scripts and these Node tests in strict mode without emitting JavaScript:

```powershell
pnpm typecheck:tooling
pnpm test:governance
pnpm --filter @omnidesk/shared test
pnpm --filter @omnidesk/domain test
```

After installing dependencies, run `pnpm db:generate` before typechecking tooling to provide the Prisma bridge's declarations. The typecheck command builds shared/domain declarations first. Package test commands also build their inputs, then use Node's test runner. Governance tests do not need PostgreSQL, Redis, a generated Prisma client or built backend artifacts at runtime.

The main commands retain their existing names:

| Command                                         | Purpose                                              |
| ----------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev:ngrok`                                | Start the development tunnel                         |
| `pnpm generate:secret`                          | Print a newly generated secret; run only when needed |
| `pnpm db:inspect`                               | Read-only PostgreSQL diagnostics                     |
| `pnpm db:budget`                                | Connection-budget calculation                        |
| `pnpm db:check-migrations $base`                | Historical immutability and expand guard             |
| `pnpm db:test-compatibility $base .compat-base` | Isolated base/current schema checks                  |
| `pnpm db:test-load $base .compat-base`          | Isolated paired HTTP/BullMQ experiment               |

CLI entry points that are also imported by tests use `isMainModule(import.meta.url)`. Local imports include their `.mts` extension. Child processes explicitly enable type stripping when running another TypeScript entry point, including the compatibility smoke process and load-test workers.

`createRequire` is confined to loading generated Prisma clients and compiled Nest modules from a selected checkout. Those artifacts retain their existing CommonJS format, including the older base checkout. The scripts themselves use ESM imports/exports; they do not execute decorator-bearing Nest source through Node's type stripper. Prisma generation and application builds remain separate preparation steps for schema/load tests.

See [migration governance](../docs/migration-governance.md) and [database operations](../docs/database-operations.md) for explicit database URLs, isolated fixtures and preparing the built base checkout. Historical load measurements predate this tooling conversion and have not been rerun for it.
