import { randomUUID } from "node:crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import type { Prisma, ReportSchedule } from "@prisma/client";
import { prisma } from "../admin/prisma.js";
import { logger } from "../lib/logging.js";
import {
  getRuntimeBranding,
  getRuntimeNotificationConfig,
  getRuntimeOptionSet,
  getRuntimeText
} from "../config-platform/runtime-config.js";
import { buildSmtpTransportOptions } from "../integrations/smtp-transport.js";
import { listReportSchemas, requestReportExport } from "./export-service.js";

/**
 * CS-7: standing report schedules. A schedule names a report preset, a cadence
 * and a recipient list; a Cloud Scheduler tick calls dispatchDueSchedules()
 * which claims due rows, generates the report through the existing export
 * pipeline and emails it. Cadence OFFERINGS (which cadences exist, at what
 * time) are config: the reports.cadence_options option set. Code only knows
 * how to compute "next occurrence" for the three cadence kinds.
 */

// ---- Cadence ----

export type Cadence =
  | { kind: "daily"; hourUtc: number }
  | { kind: "weekly"; weekdayUtc: number; hourUtc: number }
  | { kind: "monthly"; dayOfMonthUtc: number; hourUtc: number };

const hourUtcSchema = z.number().int().min(0).max(23);
export const cadenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily"), hourUtc: hourUtcSchema }),
  z.object({
    kind: z.literal("weekly"),
    // JS convention: 0 = Sunday .. 6 = Saturday.
    weekdayUtc: z.number().int().min(0).max(6),
    hourUtc: hourUtcSchema
  }),
  z.object({
    kind: z.literal("monthly"),
    // 29-31 are clamped to the month's last day at computation time.
    dayOfMonthUtc: z.number().int().min(1).max(31),
    hourUtc: hourUtcSchema
  })
]);

// Mirrors the seeded reports.cadence_options baseline so a fresh deploy with
// nothing published still offers working cadences (CLAUDE.md safe defaults).
const FALLBACK_CADENCE_OPTIONS: Array<{ value: string; label: string; cadence: Cadence }> = [
  { value: "daily_0800utc", label: "Daily at 09:00 (WAT)", cadence: { kind: "daily", hourUtc: 8 } },
  {
    value: "weekly_mon_0800utc",
    label: "Weekly on Mondays at 09:00 (WAT)",
    cadence: { kind: "weekly", weekdayUtc: 1, hourUtc: 8 }
  },
  {
    value: "monthly_1st_0800utc",
    label: "Monthly on the 1st at 09:00 (WAT)",
    cadence: { kind: "monthly", dayOfMonthUtc: 1, hourUtc: 8 }
  }
];

export function resolveCadenceOption(cadenceKey: string): { cadence: Cadence; label: string } | null {
  const fromConfig = getRuntimeOptionSet("reports.cadence_options")
    .filter((option) => option.enabled)
    .find((option) => option.value === cadenceKey);
  if (fromConfig) {
    const parsed = cadenceSchema.safeParse(fromConfig.metadata);
    if (parsed.success) return { cadence: parsed.data, label: fromConfig.label };
  }
  const fallback = FALLBACK_CADENCE_OPTIONS.find((option) => option.value === cadenceKey);
  return fallback ? { cadence: fallback.cadence, label: fallback.label } : null;
}

function daysInMonthOf(day: Date): number {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * First occurrence of the cadence STRICTLY AFTER `after`. Walks day by day
 * (bounded) rather than doing per-kind date arithmetic - slower by
 * microseconds, but immune to month-length and rollover edge cases.
 */
export function computeNextRunAt(cadence: Cadence, after: Date): Date {
  for (let offset = 0; offset <= 62; offset += 1) {
    const day = new Date(
      Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate() + offset)
    );
    const matchesDay =
      cadence.kind === "daily" ||
      (cadence.kind === "weekly" && day.getUTCDay() === cadence.weekdayUtc) ||
      (cadence.kind === "monthly" &&
        day.getUTCDate() === Math.min(cadence.dayOfMonthUtc, daysInMonthOf(day)));
    if (!matchesDay) continue;
    const candidate = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), cadence.hourUtc)
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  // Unreachable for any cadence the schema accepts; fail safe rather than loop.
  return new Date(after.getTime() + 24 * 60 * 60 * 1000);
}

// ---- Presets ----

export function resolvePresetReportType(presetId: string): { reportType: string; label: string } | null {
  const preset = getRuntimeOptionSet("reports.presets")
    .filter((option) => option.enabled)
    .find((option) => option.value === presetId);
  if (!preset) return null;
  const reportType = preset.metadata?.reportType;
  if (typeof reportType !== "string") return null;
  if (!listReportSchemas().some((schema) => schema.reportType === reportType)) return null;
  return { reportType, label: preset.label };
}

// ---- Input contracts ----

export const recipientSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  label: z.string().trim().max(120).optional()
});
export type ScheduleRecipient = z.infer<typeof recipientSchema>;

export const createScheduleInputSchema = z.object({
  presetId: z.string().min(1),
  cadenceKey: z.string().min(1),
  recipients: z.array(recipientSchema).min(1).max(20)
});

export const updateScheduleInputSchema = z
  .object({
    presetId: z.string().min(1).optional(),
    cadenceKey: z.string().min(1).optional(),
    recipients: z.array(recipientSchema).min(1).max(20).optional(),
    enabled: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

function dedupeRecipients(recipients: ScheduleRecipient[]): ScheduleRecipient[] {
  const byEmail = new Map<string, ScheduleRecipient>();
  for (const recipient of recipients) {
    if (!byEmail.has(recipient.email)) byEmail.set(recipient.email, recipient);
  }
  return Array.from(byEmail.values());
}

function parseStoredRecipients(raw: unknown): ScheduleRecipient[] {
  const parsed = z.array(recipientSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

// ---- Serialisation for the admin UI ----

export function toScheduleSummary(schedule: ReportSchedule) {
  const cadenceLabel =
    resolveCadenceOption(schedule.cadenceKey)?.label ??
    (typeof (schedule.cadenceSnapshot as Record<string, unknown> | null)?.label === "string"
      ? String((schedule.cadenceSnapshot as Record<string, unknown>).label)
      : schedule.cadenceKey);
  return {
    id: schedule.id,
    presetId: schedule.presetId,
    presetLabel: resolvePresetReportType(schedule.presetId)?.label ?? schedule.presetId,
    reportType: schedule.reportType,
    cadenceKey: schedule.cadenceKey,
    cadenceLabel,
    recipients: parseStoredRecipients(schedule.recipients),
    enabled: schedule.enabled,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    lastRunStatus: schedule.lastRunStatus,
    lastRunDetail: schedule.lastRunDetail,
    nextRunAt: schedule.nextRunAt.toISOString(),
    createdBy: schedule.createdBy,
    updatedBy: schedule.updatedBy,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString()
  };
}

// ---- CRUD ----

export async function listSchedules() {
  const rows = await prisma.reportSchedule.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toScheduleSummary);
}

export async function createSchedule(rawInput: unknown, actorId: string) {
  const input = createScheduleInputSchema.parse(rawInput);
  const preset = resolvePresetReportType(input.presetId);
  if (!preset) {
    return { ok: false as const, status: 400, message: "Unknown or disabled report preset." };
  }
  const cadence = resolveCadenceOption(input.cadenceKey);
  if (!cadence) {
    return { ok: false as const, status: 400, message: "Unknown or disabled cadence." };
  }
  const recipients = dedupeRecipients(input.recipients);
  const schedule = await prisma.reportSchedule.create({
    data: {
      presetId: input.presetId,
      reportType: preset.reportType,
      cadenceKey: input.cadenceKey,
      cadenceSnapshot: { label: cadence.label, ...cadence.cadence } as Prisma.InputJsonValue,
      recipients: recipients as unknown as Prisma.InputJsonValue,
      enabled: true,
      nextRunAt: computeNextRunAt(cadence.cadence, new Date()),
      createdBy: actorId,
      updatedBy: actorId
    }
  });
  return { ok: true as const, schedule: toScheduleSummary(schedule) };
}

export async function updateSchedule(id: string, rawInput: unknown, actorId: string) {
  const input = updateScheduleInputSchema.parse(rawInput);
  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, status: 404, message: "Schedule not found." };
  }

  const data: Prisma.ReportScheduleUpdateInput = { updatedBy: actorId };

  if (input.presetId !== undefined) {
    const preset = resolvePresetReportType(input.presetId);
    if (!preset) return { ok: false as const, status: 400, message: "Unknown or disabled report preset." };
    data.presetId = input.presetId;
    data.reportType = preset.reportType;
  }
  if (input.cadenceKey !== undefined) {
    const cadence = resolveCadenceOption(input.cadenceKey);
    if (!cadence) return { ok: false as const, status: 400, message: "Unknown or disabled cadence." };
    data.cadenceKey = input.cadenceKey;
    data.cadenceSnapshot = { label: cadence.label, ...cadence.cadence } as Prisma.InputJsonValue;
    data.nextRunAt = computeNextRunAt(cadence.cadence, new Date());
  }
  if (input.recipients !== undefined) {
    data.recipients = dedupeRecipients(input.recipients) as unknown as Prisma.InputJsonValue;
  }
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
    // Re-enabling after a pause must not fire a backlog of missed runs.
    if (input.enabled && !existing.enabled && input.cadenceKey === undefined) {
      const cadence = resolveCadenceOption(existing.cadenceKey);
      if (cadence) data.nextRunAt = computeNextRunAt(cadence.cadence, new Date());
    }
  }

  const schedule = await prisma.reportSchedule.update({ where: { id }, data });
  return { ok: true as const, schedule: toScheduleSummary(schedule) };
}

export async function deleteSchedule(id: string) {
  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, status: 404, message: "Schedule not found." };
  }
  await prisma.reportSchedule.delete({ where: { id } });
  return { ok: true as const };
}

// ---- Email delivery ----

type EmailDependencies = {
  createTransport?: typeof nodemailer.createTransport;
};

function applyTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => values[token] ?? match);
}

export function buildScheduledReportEmail(context: {
  reportLabel: string;
  cadenceLabel: string;
  fileName: string;
  period: string;
}): { subject: string; text: string } {
  const values = {
    orgName: getRuntimeBranding().organisationName,
    reportLabel: context.reportLabel,
    cadenceLabel: context.cadenceLabel,
    fileName: context.fileName,
    period: context.period
  };
  const subject = applyTemplate(
    getRuntimeText("reports.schedule.email_subject", "{{orgName}} scheduled report: {{reportLabel}} ({{period}})"),
    values
  );
  const text = applyTemplate(
    getRuntimeText(
      "reports.schedule.email_body",
      [
        "Hello,",
        "",
        "Please find attached the scheduled {{reportLabel}} report from {{orgName}}, covering {{period}}.",
        "",
        "Attachment: {{fileName}}",
        "Cadence: {{cadenceLabel}}",
        "",
        "This report was generated and sent automatically. If you believe you received it in error, or no longer wish to receive it, reply to this email and the {{orgName}} team will update the recipient list.",
        "",
        "{{orgName}}"
      ].join("\n")
    ),
    values
  );
  return { subject, text };
}

/**
 * One message per recipient (addresses stay private from each other - the
 * directory can mix partner orgs). Returns per-recipient outcomes so the run
 * record can say exactly who got it.
 */
async function emailReportToRecipients(
  recipients: ScheduleRecipient[],
  email: { subject: string; text: string },
  attachment: { filename: string; content: string },
  dependencies: EmailDependencies = {}
): Promise<{ sent: string[]; failed: Array<{ email: string; reason: string }>; skipped: string | null }> {
  const config = getRuntimeNotificationConfig();
  if (!config) return { sent: [], failed: [], skipped: "No SMTP integration configured." };
  if (config.enabled === false) return { sent: [], failed: [], skipped: "SMTP integration is disabled." };

  const createTransport = dependencies.createTransport ?? nodemailer.createTransport;
  const transporter = createTransport(buildSmtpTransportOptions(config, 10000));
  const sent: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];
  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: recipient.email,
        ...(config.replyToEmail ? { replyTo: config.replyToEmail } : {}),
        subject: email.subject,
        text: email.text,
        attachments: [{ filename: attachment.filename, content: attachment.content }]
      });
      sent.push(recipient.email);
    } catch (error) {
      failed.push({
        email: recipient.email,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { sent, failed, skipped: null };
}

// ---- Execution ----

type RunOutcome = {
  scheduleId: string;
  status: "sent" | "failed" | "skipped";
  detail: string;
};

async function executeSchedule(
  schedule: ReportSchedule,
  options: { requestId: string; now: Date; dependencies?: EmailDependencies }
): Promise<RunOutcome> {
  // Config is the source of truth for what the preset means TODAY; the stored
  // snapshot keeps an unattended run alive if the preset was edited away.
  const preset = resolvePresetReportType(schedule.presetId);
  const reportType = preset?.reportType ?? schedule.reportType;
  const reportLabel = preset?.label ?? schedule.presetId;
  const schema = listReportSchemas().find((item) => item.reportType === reportType);
  if (!schema) {
    return {
      scheduleId: schedule.id,
      status: "failed",
      detail: `Report type ${reportType} is not in the export registry.`
    };
  }

  const result = await requestReportExport({
    requestId: options.requestId,
    reportType,
    format: "csv",
    schemaVersion: schema.schemaVersion,
    requestedBy: `schedule:${schedule.id}`
  });
  if (result.job.status !== "Ready" || !result.job.content || !result.job.fileName) {
    return {
      scheduleId: schedule.id,
      status: "failed",
      detail: result.job.error ?? "Report generation failed."
    };
  }

  const cadenceLabel =
    resolveCadenceOption(schedule.cadenceKey)?.label ??
    (typeof (schedule.cadenceSnapshot as Record<string, unknown> | null)?.label === "string"
      ? String((schedule.cadenceSnapshot as Record<string, unknown>).label)
      : schedule.cadenceKey);
  const email = buildScheduledReportEmail({
    reportLabel,
    cadenceLabel,
    fileName: result.job.fileName,
    period: `up to ${options.now.toISOString().slice(0, 10)}`
  });
  const recipients = parseStoredRecipients(schedule.recipients);
  if (recipients.length === 0) {
    return { scheduleId: schedule.id, status: "failed", detail: "Schedule has no valid recipients." };
  }

  const delivery = await emailReportToRecipients(
    recipients,
    email,
    { filename: result.job.fileName, content: result.job.content },
    options.dependencies ?? {}
  );
  if (delivery.skipped) {
    return { scheduleId: schedule.id, status: "skipped", detail: delivery.skipped };
  }
  if (delivery.sent.length === 0) {
    return {
      scheduleId: schedule.id,
      status: "failed",
      detail: `All deliveries failed: ${delivery.failed.map((f) => `${f.email} (${f.reason})`).join("; ")}`
    };
  }
  const failures = delivery.failed.length
    ? `; failed: ${delivery.failed.map((f) => `${f.email} (${f.reason})`).join("; ")}`
    : "";
  return {
    scheduleId: schedule.id,
    status: "sent",
    detail: `Sent ${result.job.fileName} to ${delivery.sent.join(", ")}${failures}`
  };
}

/**
 * Worker tick (Cloud Scheduler → /internal/reports/schedules/dispatch). Claims
 * each due schedule by advancing nextRunAt with an optimistic compare-and-set,
 * so two overlapping ticks (or two instances) cannot double-send: only the
 * instance whose UPDATE matched the old nextRunAt runs the schedule.
 *
 * Missed slots are NOT replayed: next run is computed from NOW, so a service
 * that was down over a weekend sends one current report, not a backlog.
 */
export async function dispatchDueSchedules(
  now = new Date(),
  dependencies: EmailDependencies = {}
): Promise<{ due: number; outcomes: RunOutcome[] }> {
  const due = await prisma.reportSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } }
  });
  const outcomes: RunOutcome[] = [];
  for (const schedule of due) {
    const cadence = resolveCadenceOption(schedule.cadenceKey);
    const snapshotCadence = cadenceSchema.safeParse(schedule.cadenceSnapshot);
    const effectiveCadence = cadence?.cadence ?? (snapshotCadence.success ? snapshotCadence.data : null);
    if (!effectiveCadence) {
      // Nothing valid to compute a next run from - park the schedule instead
      // of retrying it every tick forever.
      await prisma.reportSchedule.update({
        where: { id: schedule.id },
        data: {
          enabled: false,
          lastRunAt: now,
          lastRunStatus: "failed",
          lastRunDetail: `Cadence ${schedule.cadenceKey} no longer resolves; schedule disabled.`
        }
      });
      outcomes.push({
        scheduleId: schedule.id,
        status: "failed",
        detail: `Cadence ${schedule.cadenceKey} no longer resolves; schedule disabled.`
      });
      continue;
    }

    const claim = await prisma.reportSchedule.updateMany({
      where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
      data: { nextRunAt: computeNextRunAt(effectiveCadence, now) }
    });
    if (claim.count === 0) continue; // another instance claimed this slot

    const outcome = await executeSchedule(schedule, {
      // Idempotency key = the claimed slot, shared across instances.
      requestId: `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`,
      now,
      dependencies
    });
    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, lastRunStatus: outcome.status, lastRunDetail: outcome.detail }
    });
    logger.info("reports.schedule.run", {
      scheduleId: schedule.id,
      status: outcome.status,
      detail: outcome.detail
    });
    outcomes.push(outcome);
  }
  return { due: due.length, outcomes };
}

/** Operator-triggered immediate run ("Run now"); leaves nextRunAt untouched. */
export async function runScheduleNow(
  id: string,
  dependencies: EmailDependencies = {}
): Promise<{ ok: false; status: number; message: string } | { ok: true; outcome: RunOutcome }> {
  const schedule = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!schedule) return { ok: false, status: 404, message: "Schedule not found." };
  const now = new Date();
  const outcome = await executeSchedule(schedule, {
    requestId: `schedule:${id}:manual:${randomUUID()}`,
    now,
    dependencies
  });
  await prisma.reportSchedule.update({
    where: { id },
    data: { lastRunAt: now, lastRunStatus: outcome.status, lastRunDetail: outcome.detail }
  });
  logger.info("reports.schedule.manual_run", {
    scheduleId: id,
    status: outcome.status,
    detail: outcome.detail
  });
  return { ok: true, outcome };
}
