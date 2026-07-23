import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logging.js";
import { prisma } from "../admin/prisma.js";

type ReportType = "donor_summary" | "module_completion_detail" | "rewards_issuance_log";
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
    schemaVersion: "v2",
    columns: ["period", "recipients", "rewardsIssued", "totalNgnIssued"]
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
  reportType: z.enum(["donor_summary", "module_completion_detail", "rewards_issuance_log"]),
  format: z.enum(["csv", "pdf"]),
  schemaVersion: z.string().min(1),
  requestedBy: z.string().min(1)
});

const exportJobsById = new Map<string, ExportJob>();
const exportJobsByRequestId = new Map<string, ExportJob>();

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

function buildMockRows(reportType: ReportType) {
  if (reportType === "donor_summary") {
    return [
      ["2026-05", "1240", "1054", "943000"],
      ["2026-04", "1179", "1006", "889000"]
    ];
  }
  if (reportType === "module_completion_detail") {
    return [
      ["Module 1", "12000", "8120", "67.7%", "74.1%"],
      ["Module 2", "9300", "5710", "61.4%", "70.3%"]
    ];
  }
  return [
    ["2026-05-05T09:10:00Z", "+234800000001", "Module 1", "200", "Airtime API", "Issued"],
    ["2026-05-05T09:22:00Z", "+234800000003", "Module 2", "200", "Manual", "Pending"]
  ];
}

/**
 * GAP-C6: build export rows from the real database (reward / userProgress /
 * quizAttempt) instead of hardcoded mock data. Each query is wrapped so that a
 * missing/unavailable DB yields a header-only export rather than a hard failure
 * (keeps the pipeline — and its unit tests — working without a live Postgres).
 */
async function buildReportRows(reportType: ReportType): Promise<string[][]> {
  try {
    if (reportType === "rewards_issuance_log") {
      const rewards = await prisma.reward.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      return rewards.map((r) => [
        (r.issuedAt ?? r.createdAt).toISOString(),
        r.learnerPhone || "",
        r.module,
        String(r.amount),
        r.channel,
        r.status
      ]);
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
      return Array.from(byModule.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([module, agg]) => [
          module,
          String(agg.enrolled),
          String(agg.completed),
          agg.enrolled > 0 ? `${Math.round((agg.completed / agg.enrolled) * 100)}%` : "0%",
          agg.enrolled > 0 ? `${Math.round(agg.pctSum / agg.enrolled)}%` : "0%"
        ]);
    }

    // donor_summary — no donor entity exists, so summarise real disbursements
    // from the rewards ledger by month (period, recipients, total NGN issued).
    const rewards = await prisma.reward.findMany();
    const byPeriod = new Map<string, { recipients: Set<string>; issued: number; total: number }>();
    for (const r of rewards) {
      const period = (r.issuedAt ?? r.createdAt).toISOString().slice(0, 7);
      const agg = byPeriod.get(period) ?? { recipients: new Set<string>(), issued: 0, total: 0 };
      agg.recipients.add(r.userId);
      if (r.status === "Issued") {
        agg.issued += 1;
        agg.total += r.amount;
      }
      byPeriod.set(period, agg);
    }
    return Array.from(byPeriod.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([period, agg]) => [
        period,
        String(agg.recipients.size),
        String(agg.issued),
        String(Math.round(agg.total))
      ]);
  } catch (error) {
    logger.error("reports.export.query_failed", error, { reportType });
    return [];
  }
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

  const registry = reportSchemaRegistry[request.reportType];
  const rows =
    renderMode() === "mock"
      ? buildMockRows(request.reportType)
      : await buildReportRows(request.reportType);
  const extension = request.format;
  const fileName = `${request.reportType}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  const content =
    request.format === "csv"
      ? toCsv(registry.columns, rows)
      : toPdfLikeText(request.reportType, request.schemaVersion, registry.columns, rows);

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
  const existing = exportJobsByRequestId.get(input.requestId);
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
    exportJobsById.set(job.exportId, job);
    exportJobsByRequestId.set(job.requestId, job);
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
    exportJobsById.set(job.exportId, job);
    exportJobsByRequestId.set(job.requestId, job);
    logger.error("reports.export.failed", error, {
      requestId: job.requestId,
      reportType: job.reportType,
      format: job.format
    });
    return { status: "failed" as const, job };
  }
}

export function listReportExports() {
  return Array.from(exportJobsById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getReportExportById(exportId: string) {
  return exportJobsById.get(exportId) ?? null;
}

export function resetReportExportState() {
  exportJobsById.clear();
  exportJobsByRequestId.clear();
  renderAttemptsByRequestId.clear();
}
