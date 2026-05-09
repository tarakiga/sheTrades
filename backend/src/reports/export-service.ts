import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logging.js";

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
    schemaVersion: "v1",
    columns: ["period", "totalDonors", "newDonors", "retainedDonors", "donationTotalNgn"]
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
  return process.env.REPORT_EXPORT_RENDER_MODE ?? "mock";
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
      ["2026-05", "1240", "186", "1054", "943000"],
      ["2026-04", "1179", "173", "1006", "889000"]
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
  const rows = buildMockRows(request.reportType);
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
  const requiredToken = process.env.ADMIN_REPORTS_API_TOKEN ?? "local-dev-reports-token";
  const allowedRoles = new Set(["admin", "program_ops"]);

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
