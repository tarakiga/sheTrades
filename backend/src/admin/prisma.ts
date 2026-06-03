import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../lib/logging.js';

const connectionString = process.env.POSTGRES_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

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

    // users
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';`);
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

    // rewards
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS rewards (id TEXT PRIMARY KEY);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS module TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS channel TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_userId_fkey') THEN
          ALTER TABLE rewards ADD CONSTRAINT "rewards_userId_fkey"
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
              (table_name = 'users' AND column_name IN ('id','phone','status','createdAt','updatedAt'))
              OR (table_name = 'user_sessions' AND column_name IN ('id','userId','state','completedLessons','awaitingQuizAnswer','currentQuizIndex','namePrompted','lastUpdatedAt'))
              OR (table_name = 'user_progress' AND column_name IN ('id','userId','module','completionPercentage','updatedAt'))
              OR (table_name = 'quiz_attempts' AND column_name IN ('id','userId','lessonKey','passed','attemptCount','lastAttemptAt'))
              OR (table_name = 'rewards' AND column_name IN ('id','userId','module','amount','channel','status'))
            )
        LOOP
          EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', rec.table_name, rec.column_name);
          RAISE NOTICE 'Dropped NOT NULL from legacy column %.%', rec.table_name, rec.column_name;
        END LOOP;
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
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW admin_users_view AS
      SELECT 
        id,
        name,
        phone,
        location,
        language,
        status,
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
