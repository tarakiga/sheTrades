import { Pool } from "pg";
import type { QueryResultRow } from "pg";
import type {
  AnalyticsPageData,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "../contracts.js";
import { getAnalyticsStrategy, getPostgresMappings } from "../config.js";
import { getDataAccessPolicy } from "../config.js";
import { logger } from "../../lib/logging.js";
import { withRetry } from "../../lib/retry.js";
import { getPostgresSslConfig } from "../pg-tls.js";
import {
  normalizeLiveAggregateRow,
  toAnalyticsPageDataFromLiveAggregate
} from "./analytics-live.js";

let pool: Pool | null = null;

function getPool(): Pool | null {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    return null;
  }
  if (!pool) {
    const policy = getDataAccessPolicy();
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: policy.connectTimeoutMs,
      statement_timeout: policy.statementTimeoutMs,
      query_timeout: policy.queryTimeoutMs,
      ssl: getPostgresSslConfig()
    });
  }
  return pool;
}

function isRetryablePostgresError(error: unknown) {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return true;
  }
  const code = String((error as { code?: string }).code ?? "");
  return code.startsWith("08") || code === "57P01" || code === "40001";
}

async function queryWithPolicy<T extends QueryResultRow>(
  query: string,
  params?: unknown[]
): Promise<T[]> {
  const db = getPool();
  if (!db) {
    return [];
  }
  const policy = getDataAccessPolicy();
  return withRetry(
    async () => {
      const result = params
        ? await db.query<T>(query, params as unknown[])
        : await db.query<T>(query);
      return result.rows;
    },
    policy.retryAttempts,
    policy.retryDelayMs,
    isRetryablePostgresError
  );
}

export async function fetchUsersFromPostgres(): Promise<UsersPageData | null> {
  const db = getPool();
  if (!db) return null;
  const mappings = getPostgresMappings();

  try {
    const rows = await queryWithPolicy<{
      name: string;
      phone: string;
      location: string;
      language: string;
      completion: string;
      status: "Active" | "At Risk";
    }>(
      `SELECT name, phone, location, language, completion, status FROM ${mappings.usersView} LIMIT 200`
    );
    return { users: rows };
  } catch (error) {
    logger.error("admin.postgres.users_failed", error, { view: mappings.usersView });
    throw error;
  }
}

export async function fetchAnalyticsFromPostgres(): Promise<AnalyticsPageData | null> {
  const db = getPool();
  if (!db) return null;
  const mappings = getPostgresMappings();
  const strategy = getAnalyticsStrategy();

  try {
    if (strategy === "live") {
      const rows = await queryWithPolicy<{
        registeredCount: number;
        startedCount: number;
        completedCount: number;
        attemptedCount: number;
        passedCount: number;
        anambraRegisteredCount: number;
        anambraCompletedCount: number;
        anambraPassedCount: number;
        deltaRegisteredCount: number;
        deltaCompletedCount: number;
        deltaPassedCount: number;
      }>(
        // Identifiers are interpolated from validated mappings (allow-listed
        // by sqlIdentifierSchema / sqlColumnIdentifierSchema) and wrapped in
        // double quotes here so Postgres preserves case. Without quoting,
        // camelCase Prisma columns like "userId" / "completionPercentage"
        // get folded to lowercase by the parser and never match.
        `WITH base_users AS (
           SELECT
             u."${mappings.usersIdColumn}" AS user_id,
             u."${mappings.usersLocationColumn}" AS user_location
           FROM "${mappings.usersTable}" u
         ),
         progress_per_user AS (
           SELECT
             p."${mappings.progressUserIdColumn}" AS user_id,
             MAX(COALESCE(p."${mappings.progressCompletionColumn}", 0))::numeric AS completion_pct
           FROM "${mappings.progressTable}" p
           GROUP BY p."${mappings.progressUserIdColumn}"
         ),
         quiz_per_user AS (
           SELECT
             q."${mappings.quizUserIdColumn}" AS user_id,
             BOOL_OR(q."${mappings.quizPassedColumn}" = true) AS has_passed,
             COUNT(*)::numeric AS attempt_count
           FROM "${mappings.quizAttemptsTable}" q
           GROUP BY q."${mappings.quizUserIdColumn}"
         )
         SELECT
           COUNT(*)::numeric AS "registeredCount",
           COUNT(*) FILTER (WHERE COALESCE(ppu.completion_pct, 0) > 0)::numeric AS "startedCount",
           COUNT(*) FILTER (WHERE COALESCE(ppu.completion_pct, 0) >= 100)::numeric AS "completedCount",
           COUNT(*) FILTER (WHERE COALESCE(qpu.attempt_count, 0) > 0)::numeric AS "attemptedCount",
           COUNT(*) FILTER (WHERE COALESCE(qpu.has_passed, false))::numeric AS "passedCount",
           COUNT(*) FILTER (WHERE bu.user_location = 'Anambra')::numeric AS "anambraRegisteredCount",
           COUNT(*) FILTER (WHERE bu.user_location = 'Anambra' AND COALESCE(ppu.completion_pct, 0) >= 100)::numeric AS "anambraCompletedCount",
           COUNT(*) FILTER (WHERE bu.user_location = 'Anambra' AND COALESCE(qpu.has_passed, false))::numeric AS "anambraPassedCount",
           COUNT(*) FILTER (WHERE bu.user_location = 'Delta')::numeric AS "deltaRegisteredCount",
           COUNT(*) FILTER (WHERE bu.user_location = 'Delta' AND COALESCE(ppu.completion_pct, 0) >= 100)::numeric AS "deltaCompletedCount",
           COUNT(*) FILTER (WHERE bu.user_location = 'Delta' AND COALESCE(qpu.has_passed, false))::numeric AS "deltaPassedCount"
         FROM base_users bu
         LEFT JOIN progress_per_user ppu ON ppu.user_id = bu.user_id
         LEFT JOIN quiz_per_user qpu ON qpu.user_id = bu.user_id`
      );

      const first = rows[0];
      if (!first) {
        return null;
      }
      const aggregate = normalizeLiveAggregateRow(first);
      return toAnalyticsPageDataFromLiveAggregate(aggregate, {
        anambraLabel: "Anambra",
        deltaLabel: "Delta"
      });
    }

    const rows = await queryWithPolicy<AnalyticsPageData>(
      `SELECT registration_rate AS "registrationRate", completion_rate AS "completionRate", pass_rate AS "passRate", funnel_overall AS "funnelOverall", funnel_anambra AS "funnelAnambra", funnel_delta AS "funnelDelta" FROM ${mappings.analyticsSnapshotTable} LIMIT 1`
    );
    return rows[0] ?? null;
  } catch (error) {
    logger.error("admin.postgres.analytics_failed", error, {
      table: mappings.analyticsSnapshotTable,
      strategy
    });
    throw error;
  }
}

export async function fetchContentFromPostgres(): Promise<ContentPageData | null> {
  const db = getPool();
  if (!db) return null;
  const mappings = getPostgresMappings();

  try {
    const rows = await queryWithPolicy<{
      module: string;
      lesson: string;
      language: string;
      quiz: string;
      status: "Published" | "Draft";
    }>(`SELECT module, lesson, language, quiz, status FROM ${mappings.contentView} LIMIT 200`);
    return { lessons: rows };
  } catch (error) {
    logger.error("admin.postgres.content_failed", error, { view: mappings.contentView });
    throw error;
  }
}

export type RewardsFilters = {
  status?: "Issued" | "Pending" | "Failed";
  from?: Date;
  to?: Date;
  q?: string;
  cursor?: string;
  limit?: number;
};

export async function fetchRewardsFromPostgres(
  filters: RewardsFilters = {}
): Promise<RewardsPageData | null> {
  const db = getPool();
  if (!db) return null;

  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const where: string[] = [`r."status" IS NOT NULL`];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    where.push(`r."status" = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`r."createdAt" >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`r."createdAt" <= $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(
      `(COALESCE(u."name", '') ILIKE $${params.length} OR r."learnerPhone" ILIKE $${params.length} OR r."module" ILIKE $${params.length})`
    );
  }
  if (filters.cursor) {
    params.push(new Date(filters.cursor));
    where.push(`r."createdAt" < $${params.length}`);
  }

  params.push(limit + 1);
  const sql = `
    SELECT
      r."id", COALESCE(u."name", '') AS "learner", r."learnerPhone", r."module",
      r."amount"::float AS "amount", r."channel", r."status",
      r."createdAt", r."issuedAt", r."providerTxnId", r."failureReason",
      r."retryCount", r."noteFromActor"
    FROM rewards r
    LEFT JOIN users u ON u."id" = r."userId"
    WHERE ${where.join(" AND ")}
    ORDER BY r."createdAt" DESC
    LIMIT $${params.length}
  `;

  try {
    const rows = await queryWithPolicy<{
      id: string;
      learner: string;
      learnerPhone: string;
      module: string;
      amount: number;
      channel: string;
      status: "Issued" | "Pending" | "Failed";
      createdAt: Date;
      issuedAt: Date | null;
      providerTxnId: string | null;
      failureReason: string | null;
      retryCount: number;
      noteFromActor: string | null;
    }>(sql, params);

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = trimmed[trimmed.length - 1];
    const nextCursor = hasMore && lastRow ? lastRow.createdAt.toISOString() : null;

    return {
      rewards: trimmed.map((row) => ({
        id: row.id,
        learner: row.learner,
        learnerPhone: row.learnerPhone,
        module: row.module,
        amount: Number(row.amount),
        currency: "NGN" as const,
        channel: row.channel,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
        providerTxnId: row.providerTxnId,
        failureReason: row.failureReason,
        retryCount: row.retryCount,
        noteFromActor: row.noteFromActor
      })),
      meta: { activeProvider: null, nextCursor }
    };
  } catch (error) {
    logger.error("admin.postgres.rewards_failed", error);
    throw error;
  }
}

export async function fetchReportsFromPostgres(): Promise<ReportsPageData | null> {
  const db = getPool();
  if (!db) return null;
  const mappings = getPostgresMappings();

  try {
    const rows = await queryWithPolicy<{
      report: string;
      format: string;
      generatedAt: string;
      owner: string;
      status: "Ready" | "Queued";
    }>(
      `SELECT report, format, generated_at AS "generatedAt", owner, status FROM ${mappings.reportsView} ORDER BY generated_at DESC LIMIT 200`
    );
    return { exports: rows };
  } catch (error) {
    logger.error("admin.postgres.reports_failed", error, { view: mappings.reportsView });
    throw error;
  }
}
