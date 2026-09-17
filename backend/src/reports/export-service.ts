import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logging.js";
import { prisma } from "../admin/prisma.js";
import { DONOR_SUMMARY_COLUMNS, buildDonorSummaryRows } from "./donor-summary.js";
import {
  JOURNEY_COLUMNS,
  ME_PARTICIPANT_COLUMNS,
  expandJourneyColumns,
  journeyRow,
  participantRow,
  sortModuleKeys,
  type ModuleProgress
} from "./learner-journey.js";

type ReportType =
  | "donor_summary"
  | "module_completion_detail"
  | "rewards_issuance_log"
  | "learner_journey"
  | "me_participants";
type ExportFormat = "csv" | "pdf";
type ExportStatus = "Ready" | "Failed";

type ExportJob = {
  exportId: string;
  requestId: string;
  reportType: ReportType;
  format: ExportFormat;
  schemaVersion: string;
  requestedBy: string;
  status: ExportStatus;
  fileName?: string;
  content?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type ExportRequest = {
  requestId: string;
  reportType: ReportType;
  format: ExportFormat;
  schemaVersion: string;
  requestedBy: string;
};

const reportSchemaRegistry: Record<ReportType, { schemaVersion: string; columns: string[] }> = {
  donor_summary: {
    // v2: renamed the columns to what the data actually is. There is no donor
    // entity in the system - the report has always summarised reward
    // disbursements by month - but the v1 headers (totalDonors, newDonors,
    // retainedDonors, donationTotalNgn) claimed donor semantics the data never
    // had, which would mislead anyone reading the CSV cold.
    // v3: adds learnersEnrolled, learnersCompleted and medianDaysToComplete per
    // month, and months are West Africa Time. Schedules resolve the version
    // from this registry at run time, so a bump does not strand them.
    schemaVersion: "v3",
    columns: DONOR_SUMMARY_COLUMNS
  },
  learner_journey: {
    // One row per learner: enrolment, each module's start and completion, the
    // course completion, days to complete, certificate, airtime - in West
    // Africa Time, under a pseudonymous reference. The two "module{n}" entries
    // expand to one pair per module present when the report is generated.
    schemaVersion: "v1",
    columns: JOURNEY_COLUMNS
  },
  me_participants: {
    // Internal M&E: the journey plus name and phone, a status per module and
    // a course status. Contains personal data - for the team, never for a
    // file that leaves the organisation. The three "module{n}" entries expand
    // as a group per module.
    schemaVersion: "v1",
    columns: ME_PARTICIPANT_COLUMNS
  },
  module_completion_detail: {
    schemaVersion: "v1",
    columns: ["module", "enrolled", "completed", "completionRate", "avgScore"]
  },
  rewards_issuance_log: {
    schemaVersion: "v1",
    columns: ["issuedAt", "phone", "module", "amount", "channel", "status"]
  }
};

const exportRequestSchema = z.object({
  requestId: z.string().min(1),
  reportType: z.enum([
    "donor_summary",
    "module_completion_detail",
    "rewards_issuance_log",
    "learner_journey",
    "me_participants"
  ]),
  format: z.enum(["csv", "pdf"]),
  schemaVersion: z.string().min(1),
  requestedBy: z.string().min(1)
});

// Per-instance cache of jobs this instance has seen. The record of truth is
// the report_exports table: with several instances serving, a job rendered
// on one instance must be listable and downloadable from every other.
const exportJobsById = new Map<string, ExportJob>();
const exportJobsByRequestId = new Map<string, ExportJob>();

/** Generated reports are kept this long; older rows are pruned on each new export. */
export function reportExportRetentionDays() {
  return retentionDays();
}

function retentionDays() {
  const n = Number(process.env.REPORT_EXPORT_RETENTION_DAYS ?? "30");
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** The table is only consulted when a database is configured; tests and local runs without one use memory alone. */
function exportStoreEnabled() {
  return Boolean(process.env.POSTGRES_URL);
}

function remember(job: ExportJob) {
  exportJobsById.set(job.exportId, job);
  exportJobsByRequestId.set(job.requestId, job);
}

type ExportRow = {
  id: string;
  requestId: string;
  reportType: string;
  format: string;
  schemaVersion: string;
  requestedBy: string;
  status: string;
  fileName: string | null;
  content: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function jobFromRow(row: ExportRow): ExportJob {
  const job: ExportJob = {
    exportId: row.id,
    requestId: row.requestId,
    reportType: row.reportType as ReportType,
    format: row.format as ExportFormat,
    schemaVersion: row.schemaVersion,
    requestedBy: row.requestedBy,
    status: row.status === "Ready" ? "Ready" : "Failed",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
  if (row.fileName) job.fileName = row.fileName;
  if (row.content !== null) job.content = row.content;
  if (row.error) job.error = row.error;
  return job;
}

/** Cache, then write through. A failed write is logged and the job still serves from this instance. */
async function persistJob(job: ExportJob): Promise<void> {
  remember(job);
  if (!exportStoreEnabled()) return;
  const data = {
    requestId: job.requestId,
    reportType: job.reportType,
    format: job.format,
    schemaVersion: job.schemaVersion,
    requestedBy: job.requestedBy,
    status: job.status,
    fileName: job.fileName ?? null,
    content: job.content ?? null,
    error: job.error ?? null
  };
  try {
    await prisma.reportExport.upsert({ where: { id: job.exportId }, create: { id: job.exportId, ...data }, update: data });
    await prisma.reportExport.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - retentionDays() * 86_400_000) } }
    });
  } catch (error) {
    logger.error("reports.export.persist_failed", error, { exportId: job.exportId });
  }
}

async function findJobByRequestId(requestId: string): Promise<ExportJob | null> {
  const cached = exportJobsByRequestId.get(requestId);
  if (cached) return cached;
  if (!exportStoreEnabled()) return null;
  try {
    const row = await prisma.reportExport.findUnique({ where: { requestId } });
    if (!row) return null;
    const job = jobFromRow(row);
    remember(job);
    return job;
  } catch (error) {
    logger.error("reports.export.lookup_failed", error, { requestId });
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function renderMode() {
  // GAP-C6: default to real DB-backed exports. "mock" is opt-in (used by unit
  // tests); "always_fail"/"flaky_once" simulate renderer failures.
  return process.env.REPORT_EXPORT_RENDER_MODE ?? "real";
}

function retryPolicy() {
  const attempts = Number(process.env.REPORT_EXPORT_RETRY_ATTEMPTS ?? "3");
  const delayMs = Number(process.env.REPORT_EXPORT_RETRY_DELAY_MS ?? "75");
  return {
    attempts: Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 3,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? Math.floor(delayMs) : 75
  };
}

const renderAttemptsByRequestId = new Map<string, number>();

type ReportData = { columns: string[]; rows: string[][] };

function buildMockReport(reportType: ReportType): ReportData {
  const columns = reportSchemaRegistry[reportType].columns;
  if (reportType === "donor_summary") {
    return {
      columns,
      rows: [
        ["2026-05", "1240", "1054", "943000", "1500", "980", "3.4"],
        ["2026-04", "1179", "1006", "889000", "1420", "901", "3.9"]
      ]
    };
  }
  if (reportType === "module_completion_detail") {
    return {
      columns,
      rows: [
        ["Module 1", "12000", "8120", "67.7%", "74.1%"],
        ["Module 2", "9300", "5710", "61.4%", "70.3%"]
      ]
    };
  }
  if (reportType === "learner_journey") {
    const modules = ["module1", "module2"];
    const sample = (id: string, state: string, completed: boolean) =>
      journeyRow(
        {
          id,
          location: state,
          language: "en",
          firstContactAt: "2026-05-01T08:00:00Z",
          enrolledAt: "2026-05-01T08:05:00Z",
          lastActiveAt: "2026-05-03T10:00:00Z",
          certificateId: completed ? "mockcertificate00000000000000001" : null,
          courseCompletedAt: completed ? "2026-05-03T10:00:00Z" : null,
          rewardsIssuedNgn: completed ? 1000 : 500,
          modules: [
            { module: "module1", startedAt: "2026-05-01T08:10:00Z", completedAt: "2026-05-01T09:00:00Z" },
            { module: "module2", startedAt: "2026-05-02T08:00:00Z", completedAt: completed ? "2026-05-03T10:00:00Z" : null }
          ]
        },
        modules
      );
    return { columns: expandJourneyColumns(columns, modules), rows: [sample("mock-1", "Lagos", true), sample("mock-2", "Kano", false)] };
  }
  if (reportType === "me_participants") {
    const modules = ["module1", "module2"];
    const sample = (id: string, name: string, phone: string, completed: boolean) =>
      participantRow(
        {
          id,
          name,
          phone,
          location: "Lagos",
          language: "en",
          firstContactAt: "2026-05-01T08:00:00Z",
          enrolledAt: "2026-05-01T08:05:00Z",
          lastActiveAt: "2026-05-03T10:00:00Z",
          certificateId: completed ? "mockcertificate00000000000000001" : null,
          courseCompletedAt: completed ? "2026-05-03T10:00:00Z" : null,
          rewardsIssuedNgn: completed ? 1000 : 500,
          modules: [
            { module: "module1", startedAt: "2026-05-01T08:10:00Z", completedAt: "2026-05-01T09:00:00Z", pct: 100 },
            { module: "module2", startedAt: "2026-05-02T08:00:00Z", completedAt: completed ? "2026-05-03T10:00:00Z" : null, pct: completed ? 100 : 40 }
          ]
        },
        modules
      );
    return {
      columns: expandJourneyColumns(columns, modules),
      rows: [sample("mock-1", "Amaka Obi", "+234800000001", true), sample("mock-2", "Ruth Okon", "+234800000002", false)]
    };
  }
  return {
    columns,
    rows: [
      ["2026-05-05T09:10:00Z", "+234800000001", "Module 1", "200", "Airtime API", "Issued"],
      ["2026-05-05T09:22:00Z", "+234800000003", "Module 2", "200", "Manual", "Pending"]
    ]
  };
}

/**
 * GAP-C6: build export rows from the real database (reward / userProgress /
 * quizAttempt) instead of hardcoded mock data. Each query is wrapped so that a
 * missing/unavailable DB yields a header-only export rather than a hard failure
 * (keeps the pipeline — and its unit tests — working without a live Postgres).
 */
async function buildReport(reportType: ReportType): Promise<ReportData> {
  const columns = reportSchemaRegistry[reportType].columns;
  try {
    if (reportType === "rewards_issuance_log") {
      const rewards = await prisma.reward.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      const rows = rewards.map((r) => [
        (r.issuedAt ?? r.createdAt).toISOString(),
        r.learnerPhone || "",
        r.module,
        String(r.amount),
        r.channel,
        r.status
      ]);
      return { columns, rows };
    }

    if (reportType === "module_completion_detail") {
      const progress = await prisma.userProgress.findMany();
      const byModule = new Map<string, { enrolled: number; completed: number; pctSum: number }>();
      for (const p of progress) {
        const agg = byModule.get(p.module) ?? { enrolled: 0, completed: 0, pctSum: 0 };
        agg.enrolled += 1;
        agg.pctSum += p.completionPercentage;
        if (p.completionPercentage >= 100) agg.completed += 1;
        byModule.set(p.module, agg);
      }
      const rows = Array.from(byModule.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([module, agg]) => [
          module,
          String(agg.enrolled),
          String(agg.completed),
          agg.enrolled > 0 ? `${Math.round((agg.completed / agg.enrolled) * 100)}%` : "0%",
          agg.enrolled > 0 ? `${Math.round(agg.pctSum / agg.enrolled)}%` : "0%"
        ]);
      return { columns, rows };
    }

    if (reportType === "learner_journey" || reportType === "me_participants") {
      // Awaited on purpose: a returned-but-unawaited promise rejects OUTSIDE
      // this try, and the header-only fallback below would never apply.
      return await buildLearnerJourney(reportType === "me_participants" ? "participants" : "journey");
    }

    // donor_summary v3 - no donor entity exists, so summarise real
    // disbursements from the rewards ledger by month, and next to them how
    // many learners enrolled (accepted the notice) and completed (certificate
    // issued) that month, and the median days from enrolment to completion.
    const [rewards, enrolments, completions] = await Promise.all([
      prisma.reward.findMany({ select: { userId: true, status: true, amount: true, issuedAt: true, createdAt: true } }),
      prisma.user.findMany({ where: { consentDecidedAt: { not: null } }, select: { consentDecidedAt: true } }),
      prisma.certificate.findMany({
        where: { revokedAt: null },
        select: { issuedAt: true, user: { select: { consentDecidedAt: true } } }
      })
    ]);
    return {
      columns,
      rows: buildDonorSummaryRows({
        rewards,
        enrolments: enrolments.map((e) => e.consentDecidedAt).filter((d): d is Date => d !== null),
        completions: completions.map((c) => ({ issuedAt: c.issuedAt, enrolledAt: c.user.consentDecidedAt }))
      })
    };
  } catch (error) {
    logger.error("reports.export.query_failed", error, { reportType });
    const perLearner = reportType === "learner_journey" || reportType === "me_participants";
    return { columns: perLearner ? expandJourneyColumns(columns, []) : columns, rows: [] };
  }
}

type JourneyRawRow = {
  id: string;
  name: string | null;
  phone: string | null;
  location: string | null;
  language: string | null;
  firstContactAt: Date;
  enrolledAt: Date | null;
  lastActiveAt: Date | null;
  certificateId: string | null;
  courseCompletedAt: Date | null;
  rewardsIssuedNgn: number | string | null;
  modules: string | null;
};

function parseModules(raw: string | null): ModuleProgress[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m) => ({
        module: String(m.module ?? ""),
        startedAt: typeof m.startedAt === "string" ? m.startedAt : null,
        completedAt: typeof m.completedAt === "string" ? m.completedAt : null,
        pct: typeof m.pct === "number" ? m.pct : null
      }))
      .filter((m) => m.module.length > 0);
  } catch {
    return [];
  }
}

/**
 * One query, one row per learner. The per-module part is aggregated to JSON
 * in SQL so the whole directory is a single pass rather than a query per
 * learner. Timestamps inside the JSON are written as UTC ISO strings
 * explicitly: user_progress columns are naive TIMESTAMP(3) stored as UTC, and
 * Postgres would otherwise serialise them without a zone, which JS reads as
 * local time.
 */
async function buildLearnerJourney(variant: "journey" | "participants"): Promise<ReportData> {
  const rows = await prisma.$queryRawUnsafe<JourneyRawRow[]>(`
    SELECT u.id,
           u.name,
           u.phone,
           u.location,
           u.language,
           u."createdAt" AS "firstContactAt",
           u."consentDecidedAt" AS "enrolledAt",
           s."lastUpdatedAt" AS "lastActiveAt",
           c."publicId" AS "certificateId",
           c."issuedAt" AS "courseCompletedAt",
           COALESCE(r.total, 0)::float AS "rewardsIssuedNgn",
           p.modules::text AS modules
    FROM users u
    LEFT JOIN user_sessions s ON s."userId" = u.id
    LEFT JOIN certificates c ON c."userId" = u.id AND c."revokedAt" IS NULL
    LEFT JOIN (
      SELECT "userId", SUM(amount) AS total FROM rewards WHERE status = 'Issued' GROUP BY "userId"
    ) r ON r."userId" = u.id
    LEFT JOIN (
      SELECT "userId",
             json_agg(json_build_object(
               'module', module,
               'pct', "completionPercentage",
               'startedAt', CASE WHEN "startedAt" IS NULL THEN NULL
                            ELSE to_char("startedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z' END,
               'completedAt', CASE WHEN "completionPercentage" >= 100
                              THEN to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z' ELSE NULL END
             )) AS modules
      FROM user_progress GROUP BY "userId"
    ) p ON p."userId" = u.id
    ORDER BY u."createdAt" ASC, u.id ASC
  `);
  const learners = rows.map((r) => ({ ...r, modules: parseModules(r.modules) }));
  const moduleKeys = sortModuleKeys(learners.flatMap((l) => l.modules.map((m) => m.module)));
  if (variant === "participants") {
    return {
      columns: expandJourneyColumns(ME_PARTICIPANT_COLUMNS, moduleKeys),
      rows: learners.map((l) => participantRow(l, moduleKeys))
    };
  }
  return {
    columns: expandJourneyColumns(JOURNEY_COLUMNS, moduleKeys),
    rows: learners.map((l) => journeyRow(l, moduleKeys))
  };
}

function toCsv(columns: string[], rows: string[][]) {
  const escaped = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const header = columns.map(escaped).join(",");
  const body = rows.map((row) => row.map(escaped).join(",")).join("\n");
  return `${header}\n${body}`;
}

function toPdfLikeText(
  reportType: ReportType,
  schemaVersion: string,
  columns: string[],
  rows: string[][]
) {
  const heading = `PDF_REPORT ${reportType} schema=${schemaVersion}`;
  const cols = `COLUMNS: ${columns.join(" | ")}`;
  const body = rows.map((row, idx) => `${idx + 1}. ${row.join(" | ")}`).join("\n");
  return `${heading}\n${cols}\n${body}`;
}

async function renderExportContent(
  request: ExportRequest
): Promise<{ fileName: string; content: string }> {
  const attempts = (renderAttemptsByRequestId.get(request.requestId) ?? 0) + 1;
  renderAttemptsByRequestId.set(request.requestId, attempts);

  if (renderMode() === "always_fail") {
    throw new Error("Report renderer failed.");
  }
  if (renderMode() === "flaky_once" && attempts === 1) {
    throw new Error("Transient renderer failure.");
  }

  const data =
    renderMode() === "mock" ? buildMockReport(request.reportType) : await buildReport(request.reportType);
  const extension = request.format;
  const fileName = `${request.reportType}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  const content =
    request.format === "csv"
      ? toCsv(data.columns, data.rows)
      : toPdfLikeText(request.reportType, request.schemaVersion, data.columns, data.rows);

  return { fileName, content };
}

export function authorizeReportsAccess(headers: Record<string, string | string[] | undefined>) {
  const roleRaw = headers["x-admin-role"];
  const tokenRaw = headers["x-admin-token"];
  const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  // Fail closed: never fall back to a hardcoded token. The previous default
  // ("local-dev-reports-token") shipped in the public repo, so anyone could
  // call the donor-export API. When ADMIN_REPORTS_API_TOKEN is unset the
  // export surface is simply disabled until an operator configures a secret.
  const requiredToken = process.env.ADMIN_REPORTS_API_TOKEN;
  const allowedRoles = new Set(["admin", "program_ops"]);

  if (!requiredToken) {
    return {
      ok: false as const,
      message: "Reports export is not configured (ADMIN_REPORTS_API_TOKEN is unset)."
    };
  }
  if (!role || !allowedRoles.has(role)) {
    return { ok: false as const, message: "Forbidden: missing or invalid admin role." };
  }
  if (!token || token !== requiredToken) {
    return { ok: false as const, message: "Forbidden: invalid admin token." };
  }
  return { ok: true as const };
}

export function listReportSchemas() {
  return Object.entries(reportSchemaRegistry).map(([reportType, details]) => ({
    reportType,
    schemaVersion: details.schemaVersion,
    columns: details.columns
  }));
}

export async function requestReportExport(rawInput: unknown) {
  const input = exportRequestSchema.parse(rawInput);
  const existing = await findJobByRequestId(input.requestId);
  if (existing) {
    return { status: "duplicate" as const, job: existing };
  }

  const registry = reportSchemaRegistry[input.reportType];
  if (registry.schemaVersion !== input.schemaVersion) {
    throw new Error(
      `Schema mismatch for ${input.reportType}. Expected ${registry.schemaVersion}, received ${input.schemaVersion}.`
    );
  }

  const job: ExportJob = {
    exportId: randomUUID(),
    requestId: input.requestId,
    reportType: input.reportType,
    format: input.format,
    schemaVersion: input.schemaVersion,
    requestedBy: input.requestedBy,
    status: "Failed",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  try {
    const policy = retryPolicy();
    const rendered = await withRetry(
      () => renderExportContent(input),
      policy.attempts,
      policy.delayMs
    );
    job.status = "Ready";
    job.fileName = rendered.fileName;
    job.content = rendered.content;
    job.updatedAt = nowIso();
    await persistJob(job);
    logger.info("reports.export.ready", {
      exportId: job.exportId,
      requestId: job.requestId,
      reportType: job.reportType,
      format: job.format,
      schemaVersion: job.schemaVersion
    });
    return { status: "created" as const, job };
  } catch (error) {
    job.status = "Failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = nowIso();
    await persistJob(job);
    logger.error("reports.export.failed", error, {
      requestId: job.requestId,
      reportType: job.reportType,
      format: job.format
    });
    return { status: "failed" as const, job };
  }
}

/** Newest first, without content. From the table when there is one, so every instance shows the same history. */
export async function listReportExports(): Promise<ExportJob[]> {
  if (exportStoreEnabled()) {
    try {
      const rows = await prisma.reportExport.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          requestId: true,
          reportType: true,
          format: true,
          schemaVersion: true,
          requestedBy: true,
          status: true,
          fileName: true,
          error: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return rows.map((row) => jobFromRow({ ...row, content: null }));
    } catch (error) {
      logger.error("reports.export.list_failed", error);
    }
  }
  return Array.from(exportJobsById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** With content. This instance's cache first, then the table. */
export async function getReportExportById(exportId: string): Promise<ExportJob | null> {
  const cached = exportJobsById.get(exportId);
  if (cached) return cached;
  if (!exportStoreEnabled()) return null;
  try {
    const row = await prisma.reportExport.findUnique({ where: { id: exportId } });
    if (!row) return null;
    const job = jobFromRow(row);
    remember(job);
    return job;
  } catch (error) {
    logger.error("reports.export.lookup_failed", error, { exportId });
    return null;
  }
}

/** Tests only: forget everything this instance knows, and (under NODE_ENV=test) empty the table. */
export function resetReportExportState(): Promise<void> {
  exportJobsById.clear();
  exportJobsByRequestId.clear();
  renderAttemptsByRequestId.clear();
  if (!exportStoreEnabled() || process.env.NODE_ENV !== "test") return Promise.resolve();
  return prisma.reportExport.deleteMany({}).then(
    () => undefined,
    () => undefined
  );
}

/** Tests only: forget the cache but keep the table - what a request landing on another instance sees. */
export function clearReportExportMemoryForTests(): void {
  exportJobsById.clear();
  exportJobsByRequestId.clear();
}
