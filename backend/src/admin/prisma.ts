import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../lib/logging.js';

// Without POSTGRES_URL, point at a guaranteed-closed port so any accidental
// query fails FAST with ECONNREFUSED. An undefined connection string makes pg
// dial the developer's LOCAL Postgres (localhost:5432, OS user, no password);
// when one is running, the SASL handshake fails in a way that orphans the
// socket inside pg - pinning the node:test event loop for ~60s per file.
const connectionString =
  process.env.POSTGRES_URL ?? "postgres://unset:unset@127.0.0.1:1/unset";
// allowExitOnIdle: idle sockets must not pin the event loop - without it, a
// failed connection attempt (e.g. local runs with no POSTGRES_URL) holds the
// test runner hostage for ~60s after the tests finish.
const pool = new Pool({ connectionString, allowExitOnIdle: true });
// A pool-level error listener: pg emits errors for idle clients OUTSIDE any
// query promise chain. Unhandled, those become unhandledRejection/uncaught
// events - which on Node crashes the process, turning a transient DB blip
// into a container restart mid-request. The failing query itself still
// rejects to its caller; this only tames the background duplicate.
pool.on("error", (error) => {
  logger.warn("pg.pool.client_error", { error: error.message });
});
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

/**
 * Test-only teardown. A pg client whose connection FAILED (e.g. local runs
 * with no POSTGRES_URL) can leave its socket open, pinning the node:test
 * event loop for ~60s and failing the file on "stray activity". Test files
 * whose passing tests touch prisma call this from an after() hook.
 */
export async function disconnectPrismaForTests(): Promise<void> {
  try {
    await prisma.$disconnect();
    // With a driver adapter the APP owns the pool - $disconnect does not end
    // it, so close it explicitly or its sockets outlive the tests.
    await pool.end();
  } catch {
    // Teardown must never fail a test run.
  }
}

/**
 * Idempotent bootstrap of the Prisma-managed tables. The Prisma schema lives
 * in backend/prisma/schema.prisma but no migration files have ever been
 * generated for it, so a fresh staging Postgres has none of these tables.
 *
 * Each table is created with IF NOT EXISTS, then every column is added with
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS. This double-pass is what makes
 * the bootstrap resilient against schema drift: if a table already exists
 * (from an earlier version of the codebase or a manual setup) but is missing
 * columns the current Prisma schema requires, the ALTER calls fill them in
 * without touching existing data.
 *
 * Keep this in sync with backend/prisma/schema.prisma. If you remove or
 * rename a column in the Prisma schema this code will not drop it; that
 * needs an explicit migration.
 */
export async function ensurePrismaTables() {
  try {
    logger.info("Ensuring Prisma-managed tables exist...");

    // Some staging Postgres instances carry legacy versions of the
    // analytics tables (quiz_attempts, user_progress, rewards) from
    // earlier schema iterations. Those tables don't have an `id` column
    // at all, so the CREATE TABLE IF NOT EXISTS path is a no-op and the
    // ADD COLUMN ALTERs can't promote a regular column to PRIMARY KEY.
    // Drop these tables when they predate the current schema (no id
    // column) so the bootstrap can recreate them cleanly. We only do
    // this for the analytics tables the bot starts writing to fresh in
    // this commit — never for `users` / `user_sessions` which already
    // hold real learner data.
    for (const table of ["quiz_attempts", "user_progress", "rewards"]) {
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${table}'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = 'id'
          ) THEN
            EXECUTE 'DROP TABLE ${table} CASCADE';
            RAISE NOTICE 'Dropped legacy ${table} (no id column) for clean recreate';
          END IF;
        END $$;
      `);
    }

    // processed_webhook_messages — cross-replica, bounded inbound-webhook dedup
    // (GAP-C3). A claimed row gates duplicate Meta deliveries; rows are pruned
    // opportunistically by age so the table never grows unbounded.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS processed_webhook_messages (message_id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`
    );

    // admin_sessions — GAP-D1: admin sessions used to live in an in-memory Map,
    // so they were invalid across replicas and lost on every scale-to-zero
    // (silently logging admins out). Keep in sync with schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS admin_sessions (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["adminUserId", "TEXT"],
      ["tokenId", "TEXT"],
      ["expiresAt", "TIMESTAMP(3)"],
      ["revokedAt", "TIMESTAMP(3)"],
      ["lastSeenAt", "TIMESTAMP(3)"],
      ["createdAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }

    // admin_accounts TOTP columns - two-factor auth. All nullable so existing
    // admins keep signing in with a password alone until they enrol.
    for (const [column, type] of [
      ["totpSecret", "TEXT"],
      ["totpEnabledAt", "TIMESTAMP(3)"],
      ["totpRecoveryCodes", "JSONB"],
      ["totpLastUsedStep", "INTEGER"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }

    // auth_throttle — login rate limiting. Persisted so guesses cannot be
    // spread across replicas or reset by a scale-to-zero. Keep in sync with
    // schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS auth_throttle (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["scope", "TEXT"],
      ["key", "TEXT"],
      ["failures", "INTEGER NOT NULL DEFAULT 0"],
      ["firstFailureAt", "TIMESTAMP(3)"],
      ["lockedUntil", "TIMESTAMP(3)"],
      ["lockoutCount", "INTEGER NOT NULL DEFAULT 0"],
      ["updatedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE auth_throttle ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    // The upsert path depends on this uniqueness holding.
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS auth_throttle_scope_key_key ON auth_throttle ("scope", "key");`
    );

    // certificates — one row per learner who has finished every module. Every
    // printed value is a column rather than a join because a certificate must
    // keep saying what was true the day it was earned, even as the curriculum
    // changes underneath it. Keep in sync with schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS certificates (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["publicId", "TEXT"],
      ["userId", "TEXT"],
      ["learnerName", "TEXT"],
      ["programmeName", "TEXT"],
      ["modulesCompleted", "INTEGER NOT NULL DEFAULT 0"],
      ["totalModules", "INTEGER NOT NULL DEFAULT 0"],
      ["issuedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["revokedAt", "TIMESTAMP(3)"],
      ["revokedReason", "TEXT"],
      ["revokedBy", "TEXT"],
      ["templateKey", "TEXT"],
      ["templateVersion", "INTEGER NOT NULL DEFAULT 1"],
      ["createdAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE certificates ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    // publicId is the identifier in the verification URL and one learner earns
    // at most one certificate; both upsert paths depend on these holding.
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "certificates_publicId_key" ON certificates ("publicId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "certificates_userId_key" ON certificates ("userId");`
    );

    // certificate_assets — certificate artwork as bytes in Postgres rather
    // than object storage: a handful of images does not justify a GCS bucket,
    // its IAM policy and a CORS config. Keep in sync with schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS certificate_assets (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["key", "TEXT"],
      ["kind", "TEXT"],
      ["mimeType", "TEXT"],
      ["bytes", "BYTEA"],
      ["width", "INTEGER NOT NULL DEFAULT 0"],
      ["height", "INTEGER NOT NULL DEFAULT 0"],
      ["checksum", "TEXT"],
      ["uploadedBy", "TEXT"],
      ["uploadedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE certificate_assets ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    // Assets are addressed by key from the template, never by row id.
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS certificate_assets_key_key ON certificate_assets ("key");`
    );

    // translation_requests — GAP-D1: the /content translation queue used to
    // live in an in-memory Map, so requests vanished whenever Cloud Run scaled
    // to zero. Keep in sync with the TranslationRequest model in schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS translation_requests (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["contentDocumentId", "TEXT"],
      ["contentKey", "TEXT"],
      ["contentTitle", "TEXT"],
      ["sourceLanguage", "TEXT"],
      ["method", "TEXT"],
      ["targetLanguage", "TEXT"],
      ["priority", "TEXT"],
      ["note", "TEXT NOT NULL DEFAULT ''"],
      ["status", "TEXT"],
      ["integrationState", "TEXT"],
      ["integrationJobId", "TEXT"],
      ["completionNote", "TEXT"],
      ["completedAt", "TIMESTAMP(3)"],
      ["completedBy", "TEXT"],
      ["reviewDraftVersionId", "TEXT"],
      ["requestedBy", "TEXT"],
      ["requestedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE translation_requests ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }

    // translation_drafts — machine-translated strings awaiting human review.
    // One row per (content document, target language). Never written to live
    // content directly; promotion copies approved strings into the content
    // document's draft. Keep in sync with the TranslationDraft model.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS translation_drafts (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["contentDocumentId", "TEXT"],
      ["contentKey", "TEXT"],
      ["targetLanguage", "TEXT"],
      ["payload", "JSONB NOT NULL DEFAULT '{}'::jsonb"],
      ["runSummary", "JSONB"],
      ["status", "TEXT NOT NULL DEFAULT 'machine_draft'"],
      ["assignee", "TEXT"],
      ["sourceHash", "TEXT NOT NULL DEFAULT ''"],
      ["createdAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["promotedAt", "TIMESTAMP(3)"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE translation_drafts ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS translation_drafts_doc_lang_key ON translation_drafts ("contentDocumentId", "targetLanguage");`
    );

    // outbound_messages — audit log of operator-initiated WhatsApp outreach
    // (Contact Learner). Keep in sync with the OutboundMessage model.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS outbound_messages (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["phone", "TEXT"],
      ["kind", "TEXT"],
      ["body", "TEXT NOT NULL DEFAULT ''"],
      ["status", "TEXT NOT NULL DEFAULT 'failed'"],
      ["detail", "TEXT"],
      ["sentBy", "TEXT NOT NULL DEFAULT ''"],
      ["createdAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS outbound_messages_phone_created_idx ON outbound_messages ("phone", "createdAt");`
    );

    // report_schedules — CS-7: standing report-generation + email schedules.
    // Keep in sync with the ReportSchedule model in schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS report_schedules (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["presetId", "TEXT"],
      ["reportType", "TEXT"],
      ["cadenceKey", "TEXT"],
      ["cadenceSnapshot", "JSONB NOT NULL DEFAULT '{}'::jsonb"],
      ["recipients", "JSONB NOT NULL DEFAULT '[]'::jsonb"],
      ["enabled", "BOOLEAN NOT NULL DEFAULT true"],
      ["lastRunAt", "TIMESTAMP(3)"],
      ["lastRunStatus", "TEXT"],
      ["lastRunDetail", "TEXT"],
      ["nextRunAt", "TIMESTAMP(3)"],
      ["createdBy", "TEXT NOT NULL DEFAULT ''"],
      ["updatedBy", "TEXT NOT NULL DEFAULT ''"],
      ["createdAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "report_schedules_enabled_nextRunAt_idx" ON report_schedules ("enabled", "nextRunAt");`
    );

    // users
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "flaggedForFollowUp" BOOLEAN NOT NULL DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "followUpNote" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "flaggedAt" TIMESTAMP(3);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    // Phone is UNIQUE; add the constraint if missing. Wrap in a DO block so
    // re-running is silent.
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_key'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
        END IF;
      END $$;
    `);

    // user_sessions
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS state TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "selectedModuleId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "currentLessonKey" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "completedLessons" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "awaitingQuizAnswer" BOOLEAN NOT NULL DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "currentQuizIndex" INTEGER NOT NULL DEFAULT 0;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "quizRetryCount" INTEGER NOT NULL DEFAULT 0;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "namePrompted" BOOLEAN NOT NULL DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_userId_key') THEN
          ALTER TABLE user_sessions ADD CONSTRAINT "user_sessions_userId_key" UNIQUE ("userId");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_userId_fkey') THEN
          ALTER TABLE user_sessions ADD CONSTRAINT "user_sessions_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // user_progress
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS user_progress (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS module TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS "completionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_progress_user_module_unique') THEN
          ALTER TABLE user_progress ADD CONSTRAINT user_progress_user_module_unique UNIQUE ("userId", module);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_progress_userId_fkey') THEN
          ALTER TABLE user_progress ADD CONSTRAINT "user_progress_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // quiz_attempts
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS quiz_attempts (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS "lessonKey" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS passed BOOLEAN NOT NULL DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 1;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_user_lesson_unique') THEN
          ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_user_lesson_unique UNIQUE ("userId", "lessonKey");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_userId_fkey') THEN
          ALTER TABLE quiz_attempts ADD CONSTRAINT "quiz_attempts_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // TODO(Task 2): backfill learnerPhone from users.phone for legacy Pending
    // rewards before the payouts worker runs against them, e.g.:
    //   UPDATE rewards r SET "learnerPhone" = u.phone
    //   FROM users u WHERE r."userId" = u.id AND r."learnerPhone" = '';
    // rewards
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS rewards (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS module TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS channel TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "learnerPhone" TEXT NOT NULL DEFAULT '';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "providerTxnId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "failureReason" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "attemptInProgress" BOOLEAN NOT NULL DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "noteFromActor" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);

    // Pre-clean any legacy duplicate (userId, module) rows so the UNIQUE
    // constraint can be added safely. The previous findFirst+create path
    // had a TOCTOU race that could (rarely) insert duplicates; keep the
    // row with the lowest ctid (oldest). Idempotent on a clean DB.
    await prisma.$executeRawUnsafe(`
      DELETE FROM rewards a
      USING rewards b
      WHERE a.ctid < b.ctid
        AND a."userId" = b."userId"
        AND a.module = b.module;
    `);

    // Compound uniqueness so the bot can use prisma.reward.upsert. Wrapped
    // in its own EXCEPTION block so an unforeseen failure here does not
    // abort the rest of the bootstrap (the outer try/catch would otherwise
    // skip every subsequent ALTER + the legacy-NOT-NULL sweep).
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_userId_module_key') THEN
          BEGIN
            ALTER TABLE rewards ADD CONSTRAINT "rewards_userId_module_key" UNIQUE ("userId", module);
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'rewards_userId_module_key add failed: %', SQLERRM;
          END;
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_userId_fkey') THEN
          ALTER TABLE rewards ADD CONSTRAINT "rewards_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // certificates.userId -> users.id. Added here rather than beside the
    // CREATE TABLE above because `users` is not bootstrapped until later in
    // this function. CASCADE so wiping a learner takes their certificate with
    // them — a certificate for a deleted learner is unverifiable anyway.
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificates_userId_fkey') THEN
          ALTER TABLE certificates ADD CONSTRAINT "certificates_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Neutralise legacy NOT NULL constraints on columns not in the current
    // Prisma schema. If a table existed before with extra required columns
    // (`email`, etc.) that Prisma no longer writes to, the inserts would
    // fail with P2011 NullConstraintViolation. We DROP NOT NULL on any
    // column that is required, has no default, and is not in our managed
    // set for that table. Existing data is untouched.
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE rec RECORD;
      BEGIN
        FOR rec IN
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('users','user_sessions','user_progress','quiz_attempts','rewards')
            AND is_nullable = 'NO'
            AND column_default IS NULL
            AND NOT (
              (table_name = 'users' AND column_name IN ('id','phone','status','flaggedForFollowUp','createdAt','updatedAt'))
              OR (table_name = 'user_sessions' AND column_name IN ('id','userId','state','completedLessons','awaitingQuizAnswer','currentQuizIndex','namePrompted','lastUpdatedAt'))
              OR (table_name = 'user_progress' AND column_name IN ('id','userId','module','completionPercentage','updatedAt'))
              OR (table_name = 'quiz_attempts' AND column_name IN ('id','userId','lessonKey','passed','attemptCount','lastAttemptAt'))
              OR (table_name = 'rewards' AND column_name IN ('id','userId','module','amount','channel','status','learnerPhone','retryCount','attemptInProgress','createdAt','updatedAt'))
            )
        LOOP
          EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', rec.table_name, rec.column_name);
          RAISE NOTICE 'Dropped NOT NULL from legacy column %.%', rec.table_name, rec.column_name;
        END LOOP;
      END $$;
    `);

    // admin_accounts (admin DASHBOARD users — distinct from the learner
    // `users` table and the `admin_users_view` view over it). Backs the
    // Admin User Management module so admins survive restarts / replicas.
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS admin_accounts (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS email TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "fullName" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT NOT NULL DEFAULT '';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "createdBy" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_accounts_email_key') THEN
          ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_email_key UNIQUE (email);
        END IF;
      END $$;
    `);

    logger.info("Prisma-managed tables ensured.");
  } catch (error) {
    logger.error("Failed to ensure Prisma tables; admin/sandbox features may not work.", error);
    // Do not rethrow — same resilience pattern as the config-platform startup
    // migrations. Express still binds so the rest of the app can serve.
  }
}

export async function initializeAdminViews() {
  try {
    logger.info("Initializing admin dashboard views...");
    
    // admin_users_view
    // Postgres CREATE OR REPLACE VIEW is append-only: it rejects any change
    // that reorders or removes existing columns (it can only ADD new columns
    // at the end). Adding "flaggedForFollowUp" before the existing
    // "completion" column is exactly such a rejected change, so the CREATE OR
    // REPLACE silently failed and left the old column-less view in place —
    // which then made `SELECT "flaggedForFollowUp" FROM admin_users_view`
    // throw and the directory fall back to an empty list. DROP first so the
    // column set can change freely; this is a leaf view with no dependents.
    await prisma.$executeRawUnsafe(`DROP VIEW IF EXISTS admin_users_view;`);
    await prisma.$executeRawUnsafe(`
      CREATE VIEW admin_users_view AS
      SELECT
        id,
        name,
        phone,
        location,
        language,
        status,
        COALESCE("flaggedForFollowUp", false) AS "flaggedForFollowUp",
        (SELECT COALESCE(MAX("completionPercentage"), 0) FROM user_progress WHERE "userId" = users.id)::text || '%' as completion
      FROM users;
    `);

    // admin_content_view (Stub for now since content is driven by config files)
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW admin_content_view AS
      SELECT 'Stub Module' as module, 'Stub Lesson' as lesson, 'en' as language, 'Managed via config' as quiz, 'Published' as status
      WHERE 1=0;
    `);

    // admin_rewards_view
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW admin_rewards_view AS
      SELECT 
        (SELECT name FROM users WHERE id = rewards."userId") as learner,
        module,
        amount::text as amount,
        channel,
        status
      FROM rewards;
    `);

    // admin_reports_view
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW admin_reports_view AS
      SELECT 'stub' as report, 'csv' as format, CURRENT_TIMESTAMP as generated_at, 'system' as owner, 'Ready' as status
      WHERE 1=0;
    `);

    // admin_analytics_snapshot (We rely on the live strategy in postgres.ts mostly, but just in case)
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW admin_analytics_snapshot AS
      SELECT 
        '0%' as registration_rate, 
        '0%' as completion_rate, 
        '0%' as pass_rate, 
        'No data' as funnel_overall, 
        'No data' as funnel_anambra, 
        'No data' as funnel_delta;
    `);

    logger.info("Admin dashboard views initialized.");
  } catch (error) {
    logger.error("Failed to initialize admin views", error);
  }
}
