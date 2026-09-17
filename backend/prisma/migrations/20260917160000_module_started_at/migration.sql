-- When a learner started each module. Until now only the completion moment
-- was recorded (updatedAt of the row that reached 100%); the donor report
-- needs both ends. Nullable: history stays blank rather than invented.
ALTER TABLE "user_progress" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
