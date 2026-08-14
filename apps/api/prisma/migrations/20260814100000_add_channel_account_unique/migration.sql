-- Add unique constraint on channel_accounts(type, external_id)
-- Prevents duplicate channel accounts for the same provider identity.
-- IF NOT EXISTS keeps it safe for databases that already have this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "channel_accounts_type_external_id_key"
  ON "channel_accounts"("type", "external_id");
