import { Pool } from "pg";
import type { QueryResultRow } from "pg";
import type {
  AnalyticsPageData,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData, UsersDataFilters } from "../contracts.js";
import { getAnalyticsStrategy, getPostgresMappings } from "../config.js";
import { getDataAccessPolicy } from "../config.js";
import { logger } from "../../lib/logging.js";
import { withRetry } from "../../lib/retry.js";
import { getPostgresSslConfig } from "../pg-tls.js";
import { summarizeRewardStatusRows } from "../rewards-summary.js";
import { decodeUsersCursor, encodeUsersCursor, summarizeUsersRow } from "../users-directory.js";
import {
  normalizeOverallCounts,
  normalizeStateCounts,
  toAnalyticsPageDataFromLiveAggregate,
  type LiveAnalyticsAggregate
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

/**
 * Tests only. The pool is built from POSTGRES_URL on first use and then kept
 * for the life of the process, which is right in production and wrong for a
 * test that swaps the URL to provoke a connection failure: it would be handed
 * the pool an earlier test built from the real URL. Dropping the cache makes
 * the next getPool() read the environment again.
 */
export async function resetAdminPostgresPoolForTests(): Promise<void> {
  const current = pool;
  pool = null;
  if (current) await current.end().catch(() => undefined);
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

/** Directory page size: what one screen shows by default, and the most a caller may ask for. */
export const USERS_PAGE_LIMIT = 50;
export const USERS_PAGE_MAX = 200;

export async function fetchUsersFromPostgres(filters: UsersDataFilters = {}): Promise<UsersPageData | null> {
  const db = getPool();
  if (!db) return null;
  const mappings = getPostgresMappings();
  const limit = Math.min(Math.max(filters.limit ?? USERS_PAGE_LIMIT, 1), USERS_PAGE_MAX);

  // One WHERE serves the page and the summary, so the tiles describe exactly
  // the rows the list is paging through. The cursor is added to the page only.
  const where: string[] = ["TRUE"];
  const params: unknown[] = [];
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(COALESCE(name, '') ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  if (filters.flagged !== undefined) {
    params.push(filters.flagged);
    where.push(`"flaggedForFollowUp" = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }

  const pageWhere = [...where];
  const pageParams = [...params];
  const cursor = decodeUsersCursor(filters.cursor);
  if (cursor) {
    pageParams.push(cursor.createdAt, cursor.id);
    // Row comparison, so a learner sharing the last row's timestamp is still
    // reached on the next page rather than skipped.
    pageWhere.push(`("createdAt", id) < ($${pageParams.length - 1}, $${pageParams.length})`);
  }
  pageParams.push(limit + 1);

  try {
    const rows = await queryWithPolicy<{
      id: string;
      name: string;
      phone: string;
      location: string;
      language: string;
      completion: string;
      status: "Active" | "At Risk";
      flaggedForFollowUp: boolean;
      createdAt: Date;
    }>(
      // Learners mid-onboarding have no name, location or language yet. The
      // contract says string, and a null here rendered as the word "null".
      `SELECT id, COALESCE(name, '') AS name, phone, COALESCE(location, '') AS location,
              COALESCE(language, '') AS language, completion, status, "flaggedForFollowUp", "createdAt"
       FROM ${mappings.usersView}
       WHERE ${pageWhere.join(" AND ")}
       ORDER BY "createdAt" DESC, id DESC
       LIMIT $${pageParams.length}`,
      pageParams
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeUsersCursor({ createdAt: last.createdAt, id: last.id }) : null;

    // One grouped pass over progress rather than one lookup per learner:
    // the view's per-row subquery is right for a page of 50 and wrong for a
    // count over 34,000.
    const summary =
      filters.includeSummary === false
        ? undefined
        : summarizeUsersRow(
            (
              await queryWithPolicy<{
                total: string;
                active: string;
                atRisk: string;
                flagged: string;
                averageCompletionPct: string;
              }>(
                `SELECT COUNT(*)::text AS total,
                        COUNT(*) FILTER (WHERE status = 'Active')::text AS active,
                        COUNT(*) FILTER (WHERE status = 'At Risk')::text AS "atRisk",
                        COUNT(*) FILTER (WHERE COALESCE("flaggedForFollowUp", false))::text AS flagged,
                        COALESCE(AVG(COALESCE(p.pct, 0)), 0)::text AS "averageCompletionPct"
                 FROM ${mappings.usersTable} u
                 LEFT JOIN (
                   SELECT "userId", MAX("completionPercentage") AS pct
                   FROM ${mappings.progressTable} GROUP BY "userId"
                 ) p ON p."userId" = u.id
                 WHERE ${where.join(" AND ")}`,
                params
              )
            )[0]
          );

    return {
      users: page.map(({ id: _id, createdAt: _createdAt, ...r }) => ({
        ...r,
        flaggedForFollowUp: Boolean(r.flaggedForFollowUp)
      })),
      meta: { nextCursor, ...(summary ? { summary } : {}) }
    };
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
      // Identifiers are interpolated from validated mappings (allow-listed by
      // sqlIdentifierSchema / sqlColumnIdentifierSchema) and double-quoted so
      // Postgres preserves the camelCase Prisma column names.
      const cte = `WITH base_users AS (
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
         )`;

      const overallRows = await queryWithPolicy<Record<string, unknown>>(
        `${cte}
         SELECT
           COUNT(*)::numeric AS "registeredCount",
           COUNT(*) FILTER (WHERE COALESCE(ppu.completion_pct, 0) > 0)::numeric AS "startedCount",
           COUNT(*) FILTER (WHERE COALESCE(ppu.completion_pct, 0) >= 100)::numeric AS "completedCount",
           COUNT(*) FILTER (WHERE COALESCE(qpu.attempt_count, 0) > 0)::numeric AS "attemptedCount",
           COUNT(*) FILTER (WHERE COALESCE(qpu.has_passed, false))::numeric AS "passedCount"
         FROM base_users bu
         LEFT JOIN progress_per_user ppu ON ppu.user_id = bu.user_id
         LEFT JOIN quiz_per_user qpu ON qpu.user_id = bu.user_id`
      );

      const overall = overallRows[0];
      if (!overall) {
        return null;
      }

      // Dynamic per-state breakdown: one row per location the learners
      // actually have (any state, including ones admins add later).
      const stateRows = await queryWithPolicy<Record<string, unknown>>(
        `${cte}
         SELECT
           bu.user_location AS "state",
           COUNT(*)::numeric AS "registered",
           COUNT(*) FILTER (WHERE COALESCE(ppu.completion_pct, 0) >= 100)::numeric AS "completed",
           COUNT(*) FILTER (WHERE COALESCE(qpu.has_passed, false))::numeric AS "passed"
         FROM base_users bu
         LEFT JOIN progress_per_user ppu ON ppu.user_id = bu.user_id
         LEFT JOIN quiz_per_user qpu ON qpu.user_id = bu.user_id
         WHERE bu.user_location IS NOT NULL AND TRIM(bu.user_location) <> ''
         GROUP BY bu.user_location
         ORDER BY "registered" DESC, bu.user_location ASC`
      );

      const aggregate: LiveAnalyticsAggregate = {
        ...normalizeOverallCounts(overall),
        stateCounts: normalizeStateCounts(stateRows)
      };
      return toAnalyticsPageDataFromLiveAggregate(aggregate);
    }

    const rows = await queryWithPolicy<Record<string, unknown>>(
      `SELECT registration_rate AS "registrationRate", completion_rate AS "completionRate", pass_rate AS "passRate", funnel_overall AS "funnelOverall" FROM ${mappings.analyticsSnapshotTable} LIMIT 1`
    );
    const snapshot = rows[0];
    if (!snapshot) {
      return null;
    }
    return {
      registrationRate: String(snapshot.registrationRate ?? "0%"),
      completionRate: String(snapshot.completionRate ?? "0%"),
      passRate: String(snapshot.passRate ?? "0%"),
      funnelOverall: String(snapshot.funnelOverall ?? ""),
      stateFunnels: []
    };
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

    // Whole-table totals for the same period and search, broken down by
    // status. The page above is one page; every figure that used to be added
    // up from it (the hero's "paid", the Overview's automation rate) was
    // really describing the latest 25 rows. Status and cursor are left out on
    // purpose: the summary is what the status filter is applied TO.
    const summaryWhere: string[] = [`r."status" IS NOT NULL`];
    const summaryParams: unknown[] = [];
    if (filters.from) {
      summaryParams.push(filters.from);
      summaryWhere.push(`r."createdAt" >= $${summaryParams.length}`);
    }
    if (filters.to) {
      summaryParams.push(filters.to);
      summaryWhere.push(`r."createdAt" <= $${summaryParams.length}`);
    }
    if (filters.q) {
      summaryParams.push(`%${filters.q}%`);
      summaryWhere.push(
        `(COALESCE(u."name", '') ILIKE $${summaryParams.length} OR r."learnerPhone" ILIKE $${summaryParams.length} OR r."module" ILIKE $${summaryParams.length})`
      );
    }
    const summaryRows = await queryWithPolicy<{ status: string; count: string; amount: string }>(
      `
      SELECT r."status", COUNT(*)::text AS "count", COALESCE(SUM(r."amount"), 0)::text AS "amount"
      FROM rewards r
      LEFT JOIN users u ON u."id" = r."userId"
      WHERE ${summaryWhere.join(" AND ")}
      GROUP BY r."status"
      `,
      summaryParams
    );
    const summary = summarizeRewardStatusRows(summaryRows);

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
      meta: { activeProvider: null, nextCursor, summary }
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
