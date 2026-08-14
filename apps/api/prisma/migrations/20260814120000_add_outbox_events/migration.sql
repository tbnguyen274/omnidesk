-- Create outbox_events table for transactional outbox pattern.
-- Events are written atomically with domain data, then dispatched to BullMQ by the dispatcher.

CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'DEAD');

CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "type"          TEXT        NOT NULL,
  "aggregate_id"  UUID        NOT NULL,
  "payload"       JSONB       NOT NULL,
  "status"        "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"      INT         NOT NULL DEFAULT 0,
  "job_id"        TEXT,
  "error_message" TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "published_at"  TIMESTAMPTZ,
  "failed_at"     TIMESTAMPTZ,

  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "outbox_events_status_created_at_idx"
  ON "outbox_events"("status", "created_at");
