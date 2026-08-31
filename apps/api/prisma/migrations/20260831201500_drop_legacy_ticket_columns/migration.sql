-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_assigned_agent_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "tickets_status_priority_idx";
DROP INDEX IF EXISTS "tickets_assigned_agent_id_idx";

-- AlterTable
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "status";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "priority";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "assigned_agent_id";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "resolved_at";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "closed_at";

-- DropEnum
DROP TYPE IF EXISTS "TicketStatus";
