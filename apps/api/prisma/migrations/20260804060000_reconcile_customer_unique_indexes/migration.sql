-- Replace the original non-unique customer indexes with the unique constraints
-- declared by the Prisma schema. IF EXISTS/IF NOT EXISTS keeps this safe for
-- databases where a previous schema sync already created the *_key indexes.
DROP INDEX IF EXISTS "customers_email_idx";
DROP INDEX IF EXISTS "customers_external_facebook_id_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "customers_email_key"
ON "customers"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "customers_external_facebook_id_key"
ON "customers"("external_facebook_id");
