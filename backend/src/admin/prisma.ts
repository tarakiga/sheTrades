import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../lib/logging.js';

const connectionString = process.env.POSTGRES_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

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
