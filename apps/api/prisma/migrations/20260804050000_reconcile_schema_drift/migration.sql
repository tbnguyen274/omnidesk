-- AlterTable
ALTER TABLE "users"
ADD COLUMN "hashed_refresh_token" TEXT,
ADD COLUMN "password_reset_token" TEXT,
ADD COLUMN "password_reset_expires" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conversations"
ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "messages"
ADD COLUMN "reply_to_message_id" TEXT;

-- AlterTable
ALTER TABLE "tickets"
ADD COLUMN "sla_paused_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "outbound_messages"
ADD COLUMN "reply_to_message_id" TEXT;
