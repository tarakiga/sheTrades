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
 * We create them here at boot using IF NOT EXISTS so this is safe to run on
 * every cold start and does nothing on warm restarts.
 *
 * Keep this in sync with backend/prisma/schema.prisma. The column types and
 * defaults mirror what `prisma migrate dev` would produce.
 */
export async function ensurePrismaTables() {
  try {
    logger.info("Ensuring Prisma-managed tables exist...");

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        name TEXT,
        language TEXT,
        location TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        "selectedModuleId" TEXT,
        "currentLessonKey" TEXT,
        "completedLessons" TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        "awaitingQuizAnswer" BOOLEAN NOT NULL DEFAULT false,
        "currentQuizIndex" INTEGER NOT NULL DEFAULT 0,
        "namePrompted" BOOLEAN NOT NULL DEFAULT false,
        "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module TEXT NOT NULL,
        "completionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT user_progress_user_module_unique UNIQUE ("userId", module)
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "lessonKey" TEXT NOT NULL,
        passed BOOLEAN NOT NULL DEFAULT false,
        "attemptCount" INTEGER NOT NULL DEFAULT 1,
        "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT quiz_attempts_user_lesson_unique UNIQUE ("userId", "lessonKey")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rewards (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module TEXT NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        "issuedAt" TIMESTAMP(3)
      );
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
