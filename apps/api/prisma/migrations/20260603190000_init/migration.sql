-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ChannelAccountType" AS ENUM ('FACEBOOK', 'EMAIL');

-- CreateEnum
CREATE TYPE "ChannelAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('FACEBOOK_MESSAGE', 'FACEBOOK_COMMENT', 'EMAIL');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('CUSTOMER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'HTML', 'ATTACHMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('RECEIVED', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "InboundProvider" AS ENUM ('FACEBOOK', 'EMAIL');

-- CreateEnum
CREATE TYPE "InboundEventType" AS ENUM ('MESSAGE', 'COMMENT', 'EMAIL_RECEIVED');

-- CreateEnum
CREATE TYPE "InboundEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'DUPLICATED');

-- CreateEnum
CREATE TYPE "OutboundProvider" AS ENUM ('FACEBOOK', 'EMAIL');

-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "EmailSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "external_facebook_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" UUID NOT NULL,
    "type" "ChannelAccountType" NOT NULL,
    "display_name" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "status" "ChannelAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "channel_account_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "external_conversation_id" TEXT,
    "subject" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assigned_agent_id" UUID,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "inbound_event_id" UUID,
    "direction" "MessageDirection" NOT NULL,
    "sender_type" "MessageSenderType" NOT NULL,
    "sender_id" UUID,
    "content" TEXT NOT NULL,
    "content_type" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "external_message_id" TEXT,
    "raw_payload" JSONB,
    "delivery_status" "MessageDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assigned_agent_id" UUID,
    "sla_due_at" TIMESTAMP(3),
    "first_response_due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_tags" (
    "conversation_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("conversation_id","tag_id")
);

-- CreateTable
CREATE TABLE "inbound_events" (
    "id" UUID NOT NULL,
    "provider" "InboundProvider" NOT NULL,
    "event_type" "InboundEventType" NOT NULL,
    "external_event_id" TEXT,
    "dedup_key" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "normalized_status" "InboundEventStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "inbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "provider" "OutboundProvider" NOT NULL,
    "recipient_external_id" TEXT,
    "content" TEXT NOT NULL,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "external_message_id" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sync_logs" (
    "id" UUID NOT NULL,
    "channel_account_id" UUID NOT NULL,
    "sync_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_finished_at" TIMESTAMP(3),
    "status" "EmailSyncStatus" NOT NULL,
    "fetched_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "email_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_external_facebook_id_idx" ON "customers"("external_facebook_id");

-- CreateIndex
CREATE INDEX "conversations_status_last_message_at_idx" ON "conversations"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_channel_type_last_message_at_idx" ON "conversations"("channel_type", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_assigned_agent_id_idx" ON "conversations"("assigned_agent_id");

-- CreateIndex
CREATE INDEX "conversations_customer_id_idx" ON "conversations"("customer_id");

-- CreateIndex
CREATE INDEX "conversations_external_conversation_id_idx" ON "conversations"("external_conversation_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_external_message_id_key" ON "messages"("conversation_id", "external_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_conversation_id_key" ON "tickets"("conversation_id");

-- CreateIndex
CREATE INDEX "tickets_status_priority_idx" ON "tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "tickets_assigned_agent_id_idx" ON "tickets"("assigned_agent_id");

-- CreateIndex
CREATE INDEX "tickets_sla_due_at_idx" ON "tickets"("sla_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_events_dedup_key_key" ON "inbound_events"("dedup_key");

-- CreateIndex
CREATE INDEX "inbound_events_provider_event_type_received_at_idx" ON "inbound_events"("provider", "event_type", "received_at");

-- CreateIndex
CREATE INDEX "inbound_events_normalized_status_idx" ON "inbound_events"("normalized_status");

-- CreateIndex
CREATE INDEX "outbound_messages_status_created_at_idx" ON "outbound_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbound_messages_conversation_id_idx" ON "outbound_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "outbound_messages_provider_idx" ON "outbound_messages"("provider");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_inbound_event_id_fkey" FOREIGN KEY ("inbound_event_id") REFERENCES "inbound_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sync_logs" ADD CONSTRAINT "email_sync_logs_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
