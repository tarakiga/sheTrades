-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "language" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "flaggedForFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "selectedModuleId" TEXT,
    "currentLessonKey" TEXT,
    "completedLessons" TEXT[],
    "awaitingQuizAnswer" BOOLEAN NOT NULL DEFAULT false,
    "currentQuizIndex" INTEGER NOT NULL DEFAULT 0,
    "namePrompted" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "completionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonKey" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "status" TEXT NOT NULL DEFAULT 'active',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "lastLoginAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "issuedAt" TIMESTAMP(3),
    "learnerPhone" TEXT NOT NULL DEFAULT '',
    "providerTxnId" TEXT,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "attemptInProgress" BOOLEAN NOT NULL DEFAULT false,
    "noteFromActor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_requests" (
    "id" TEXT NOT NULL,
    "contentDocumentId" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "contentTitle" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "integrationState" TEXT,
    "integrationJobId" TEXT,
    "completionNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "reviewDraftVersionId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_drafts" (
    "id" TEXT NOT NULL,
    "contentDocumentId" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runSummary" JSONB,
    "status" TEXT NOT NULL DEFAULT 'machine_draft',
    "assignee" TEXT,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "promotedAt" TIMESTAMP(3),

    CONSTRAINT "translation_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "sentBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_userId_key" ON "user_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_userId_module_key" ON "user_progress"("userId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_userId_lessonKey_key" ON "quiz_attempts"("userId", "lessonKey");

-- CreateIndex
CREATE UNIQUE INDEX "admin_accounts_email_key" ON "admin_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_userId_module_key" ON "rewards"("userId", "module");

-- CreateIndex
CREATE INDEX "translation_requests_requestedAt_idx" ON "translation_requests"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "translation_drafts_contentDocumentId_targetLanguage_key" ON "translation_drafts"("contentDocumentId", "targetLanguage");

-- CreateIndex
CREATE INDEX "outbound_messages_phone_createdAt_idx" ON "outbound_messages"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "admin_sessions_adminUserId_idx" ON "admin_sessions"("adminUserId");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

