-- CS-7: report_schedules — standing instructions to generate a report on a
-- cadence and email it to a recipient list. Additive only; safe on a live DB.
CREATE TABLE IF NOT EXISTS "report_schedules" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "cadenceKey" TEXT NOT NULL,
    "cadenceSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "recipients" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunDetail" TEXT,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "report_schedules_enabled_nextRunAt_idx"
    ON "report_schedules" ("enabled", "nextRunAt");
