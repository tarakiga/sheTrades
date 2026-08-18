-- TOTP two-factor for admin accounts. Additive and nullable throughout, so it
-- is safe on a live database and every existing admin keeps signing in with a
-- password alone until they choose to enrol.
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "totpRecoveryCodes" JSONB;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "totpLastUsedStep" INTEGER;
