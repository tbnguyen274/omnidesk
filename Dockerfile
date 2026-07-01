FROM node:20-alpine

# Set up pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Some native dependencies might require Python and build-base (e.g. bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy the entire monorepo
COPY . .

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Generate Prisma Client (needed before building API/Worker)
RUN pnpm --filter api prisma:generate

# Build all applications (api, worker, web, shared)
RUN pnpm run build
