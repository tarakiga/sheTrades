-- Login throttling state. Persisted rather than in-memory so guesses cannot be
-- spread across Cloud Run replicas or reset by a scale-to-zero.
-- Additive only; safe on a live DB.
CREATE TABLE IF NOT EXISTS "auth_throttle" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "firstFailureAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lockoutCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_throttle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_throttle_scope_key_key"
    ON "auth_throttle" ("scope", "key");

CREATE INDEX IF NOT EXISTS "auth_throttle_lockedUntil_idx"
    ON "auth_throttle" ("lockedUntil");
