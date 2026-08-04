# OmniDesk Environments

## Purpose

This document records the environment boundaries established during the production-readiness baseline. Secret values must never be committed. Only example files and variable names belong in source control.

## Local development

Runtime components:

- Web: Next.js on port `3002`.
- API: NestJS on port `3000`.
- Worker: NestJS health endpoint on port `3001`.
- PostgreSQL: Docker Compose host port `55432` by default.
- Redis: Docker Compose host port `6379` by default.

Configuration sources:

- `.env` for locally executed API/worker commands.
- `.env.docker` for `docker-compose.yml`.
- `apps/web/.env.local` when frontend-only overrides are required.
- Corresponding `*.example` files define allowed variable names.

Local development may use mock providers. Development endpoints must not be exposed outside a trusted developer machine.

## Continuous integration

CI currently uses Ubuntu, Node.js 22 and pnpm 9. It runs lint, unit tests, API smoke E2E, dependency audit, secret scanning, Docker Compose validation and production builds.

Current limitation: the E2E suites mock application services and CI does not start PostgreSQL or Redis. A clean-database migration and real integration-test job are required in Stage 4.

## Staging infrastructure

`docker-compose.staging.yml` creates PostgreSQL and Redis isolated from local development:

- Compose project: `omnidesk-staging`.
- PostgreSQL host port: `65432` by default.
- Redis host port: `16379` by default.
- Separate named volumes for both data stores.
- Database and Redis ports bind to `127.0.0.1` only.
- PostgreSQL and Redis passwords are mandatory.
- Backups are written to ignored directory `backups/staging/`.

Setup:

```powershell
Copy-Item .env.staging.example .env.staging
node scripts/generate-secret.js
pnpm staging:config
pnpm staging:up
pnpm staging:backup
```

Replace every `REPLACE_*` value before running the Compose stack. Application deployment for staging is intentionally deferred to Stage 5; this stack establishes isolated stateful dependencies for integration and migration work.

## Production

No production infrastructure-as-code is committed at the Stage 0 baseline. `docker-compose.yml` is suitable for local or production-like testing, not as the final production topology.

Stage 5 must provide:

- Managed PostgreSQL with automated backup and point-in-time recovery.
- Managed Redis with authentication and TLS.
- Independent API and worker deployments.
- A one-time migration release job.
- Secret manager integration.
- TLS ingress/load balancing, metrics, alerting and rollback automation.

## Ownership

Named owners have not been provided. Until team members are assigned, accountability is defined by role:

| Area | Accountable role |
|---|---|
| Prisma schema, domain consistency, outbox and auth | Backend lead |
| Web workflows and browser E2E | Frontend lead |
| CI/CD, staging, backup, observability and secrets | Platform/DevOps lead |
| Acceptance criteria, failure testing and release evidence | QA/release owner |
| Production go/no-go decision | Engineering lead |

Actual names must be assigned before Stage 1 starts.
