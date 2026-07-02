# 1. Base stage - runtime tools only
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && \
    apk add --no-cache libc6-compat openssl

# 2. Builder stage - compile everything
FROM base AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Cache layer: install dependencies first (only re-runs if lockfile changes)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# Copy all source code (node_modules already excluded via .dockerignore)
COPY . .

# Generate Prisma client and build all apps (sequential for clear errors)
RUN pnpm --filter @omnidesk/shared build
RUN pnpm --filter api exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter api build
RUN pnpm --filter worker build
RUN pnpm --filter web build
# Verify that expected output files exist (fails build if missing)
RUN ls apps/api/dist/main.js && ls apps/worker/dist/main.js

# 3. Next.js Web target - standalone output, very small image
FROM base AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3002
CMD ["node", "apps/web/server.js"]

# 4. API target
FROM base AS api
WORKDIR /app
ENV NODE_ENV=production
# Root node_modules (pnpm hoisted deps)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# API app files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
# Shared package (now built to dist)
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
EXPOSE 3000
# Run prisma migrate deploy using local binary, then start the app
CMD ["sh", "-c", "./apps/api/node_modules/.bin/prisma migrate deploy --schema=./apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]

# 5. Worker target
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
# Shared package (now built to dist)
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
CMD ["node", "apps/worker/dist/main.js"]
