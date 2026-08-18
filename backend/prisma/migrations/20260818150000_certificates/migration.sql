-- Completion certificates. Every printed value is stored on the row rather than
-- joined at render time, so a certificate keeps saying what was true the day it
-- was earned even as the curriculum changes beneath it.
-- No FK on "userId": rewards and user_progress were bootstrapped the same way,
-- with the relation enforced by Prisma at the application layer.
-- Additive only; safe on a live DB.
CREATE TABLE IF NOT EXISTS "certificates" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learnerName" TEXT NOT NULL,
    "programmeName" TEXT NOT NULL,
    "modulesCompleted" INTEGER NOT NULL,
    "totalModules" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "revokedBy" TEXT,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "certificates_publicId_key" ON "certificates"("publicId");
CREATE UNIQUE INDEX IF NOT EXISTS "certificates_userId_key" ON "certificates"("userId");
CREATE INDEX IF NOT EXISTS "certificates_issuedAt_idx" ON "certificates"("issuedAt");

-- Certificate artwork lives in Postgres rather than a bucket: a handful of
-- images does not justify a GCS bucket, its IAM policy and a CORS config.
CREATE TABLE IF NOT EXISTS "certificate_assets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "certificate_assets_key_key" ON "certificate_assets"("key");
