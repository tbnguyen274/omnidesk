ALTER TYPE "OutboundMessageStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_UNKNOWN';

ALTER TABLE "outbound_messages"
ADD COLUMN "idempotency_key" TEXT,
ADD COLUMN "request_hash" TEXT,
ADD COLUMN "processing_started_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "outbound_messages_created_by_idempotency_key_key"
ON "outbound_messages"("created_by", "idempotency_key");

-- Recover pre-migration messages which were persisted before their BullMQ job
-- could be created. Already SENT/FAILED messages are intentionally excluded.
INSERT INTO "outbox_events" (
  "id",
  "type",
  "aggregate_id",
  "payload",
  "status",
  "attempts",
  "created_at"
)
SELECT
  gen_random_uuid(),
  'OUTBOUND_MESSAGE_SEND_REQUESTED',
  om."id",
  jsonb_build_object(
    'outboundMessageId', om."id",
    'conversationId', om."conversation_id",
    'provider', om."provider"
  ),
  'PENDING',
  0,
  NOW()
FROM "outbound_messages" om
WHERE om."status" IN ('PENDING', 'RETRYING')
  AND NOT EXISTS (
    SELECT 1
    FROM "outbox_events" oe
    WHERE oe."type" = 'OUTBOUND_MESSAGE_SEND_REQUESTED'
      AND oe."aggregate_id" = om."id"
  );
