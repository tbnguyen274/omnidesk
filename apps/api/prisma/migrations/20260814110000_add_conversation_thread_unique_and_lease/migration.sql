-- Add unique constraint on conversations(channel_account_id, external_conversation_id)
-- Prevents creating multiple active conversations for the same provider thread.
-- Only applies when external_conversation_id IS NOT NULL (partial unique index).

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_channel_account_external_conversation_key"
  ON "conversations"("channel_account_id", "external_conversation_id")
  WHERE "external_conversation_id" IS NOT NULL;

-- Add processing_started_at for lease-based idempotency in inbound event processing.
ALTER TABLE "inbound_events"
  ADD COLUMN IF NOT EXISTS "processing_started_at" TIMESTAMP(3);
