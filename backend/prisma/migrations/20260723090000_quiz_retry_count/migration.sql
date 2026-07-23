-- R3-F8: per-question retry counter so the bot can add a hint on the second
-- wrong attempt instead of repeating the question verbatim forever.
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "quizRetryCount" INTEGER NOT NULL DEFAULT 0;
