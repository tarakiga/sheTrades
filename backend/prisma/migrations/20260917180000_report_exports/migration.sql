-- Generated reports, persisted so any instance can list and serve them.
-- Every identifier is quoted: Prisma expects the camelCase columns as written.
CREATE TABLE IF NOT EXISTS "report_exports" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "fileName" TEXT,
  "content" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "report_exports_requestId_key" ON "report_exports" ("requestId");
CREATE INDEX IF NOT EXISTS "report_exports_createdAt_idx" ON "report_exports" ("createdAt");
