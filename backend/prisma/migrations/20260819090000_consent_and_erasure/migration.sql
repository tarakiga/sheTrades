-- Consent, erasure, and the ledger that survives an erasure.
--
-- Every identifier is quoted. Postgres folds unquoted identifiers to lower
-- case, and Prisma then cannot find the camelCase columns it expects.

-- A cache of the newest consent_events row, so the gate on every inbound
-- message is one read rather than a sort over history.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consentVersion" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consentDecidedAt" TIMESTAMP(3);

-- Append-only record of every privacy decision.
CREATE TABLE IF NOT EXISTS "consent_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "noticeKey" TEXT NOT NULL,
  "noticeVersion" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "consent_events_userId_decidedAt_idx"
  ON "consent_events" ("userId", "decidedAt");

-- CASCADE, unlike every other learner relation, which is RESTRICT. A consent
-- record must never outlive the person who gave it: an erasure that left these
-- behind would be keeping a record about someone who asked to be forgotten.
ALTER TABLE "consent_events" DROP CONSTRAINT IF EXISTS "consent_events_userId_fkey";
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Proof an erasure happened, holding nothing about who it was for. No foreign
-- key, deliberately: there is nothing left to point at.
CREATE TABLE IF NOT EXISTS "erasure_log" (
  "id" TEXT NOT NULL,
  "requestRef" TEXT NOT NULL,
  "requestedVia" TEXT NOT NULL,
  "actorId" TEXT,
  "tableCounts" JSONB NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "erasure_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "erasure_log_requestRef_key"
  ON "erasure_log" ("requestRef");
CREATE INDEX IF NOT EXISTS "erasure_log_decidedAt_idx"
  ON "erasure_log" ("decidedAt");

-- What survives an erasure from the rewards ledger: money that actually moved,
-- de-identified. providerTxnId stays because reconciling against the airtime
-- provider is the reason the record is kept.
CREATE TABLE IF NOT EXISTS "reward_archive" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3),
  "providerTxnId" TEXT,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_archive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reward_archive_archivedAt_idx"
  ON "reward_archive" ("archivedAt");
