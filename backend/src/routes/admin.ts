import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import {
  getAnalyticsData,
  getContentData,
  getReportsData,
  getRewardsData,
  getUsersData,
  type RewardsDataFilters
} from "../admin/data.js";
import { getLearnerDetail } from "../admin/users-detail.js";
import { prisma } from "../admin/prisma.js";
import {
  getReportExportById,
  listReportExports,
  listReportSchemas,
  requestReportExport
} from "../reports/export-service.js";
import { randomUUID } from "node:crypto";
import {
  getRuntimeOptionSet,
  getRuntimePayoutsConfig,
  getRuntimeRewardRules
} from "../config-platform/runtime-config.js";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { sendWhatsAppOutreach, type OutreachPayload } from "../whatsapp/sender.js";

// Mutating admin actions require at least editor (viewers are read-only).
const requireWriteAccess = requireRoles(["editor", "admin"]);

export const adminRouter = Router();

// Gate the entire admin data + rewards + users API behind a valid admin
// session JWT (same token the admin login mints and the config-admin router
// already validates). The login/profile routes live on the separate
// adminAuthRouter and are unaffected; the donor-export reportsRouter is
// mounted separately with its own token. The dashboard attaches the stored
// JWT to every /api/admin/* call (see dashboard/lib/admin/api.ts authHeaders).
adminRouter.use(authenticateJwt);

/**
 * GAP-D2: validate + coerce the reward list filters before they reach SQL.
 * Previously `from`/`to` went through `new Date(...)` (an unparseable value
 * became `Invalid Date`), `limit` through `Number(...)` (garbage became `NaN`
 * → `LIMIT NaN`), and `q`/`cursor` had no length cap.
 *
 * Each field carries its own `.catch(undefined)` so a single malformed filter
 * is simply dropped rather than discarding every other (valid) filter.
 */
/**
 * Query for the Overview "Users requesting help" panel. Coerced and capped for
 * the same reason as the reward filters: `limit` arrives as a string and an
 * uncapped value would let a caller pull the whole learner table.
 */
export const helpRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).catch(5).default(5)
});

export const rewardsFilterQuerySchema = z.object({
  status: z.enum(["Issued", "Pending", "Failed"]).optional().catch(undefined),
  from: z.coerce.date().optional().catch(undefined),
  to: z.coerce.date().optional().catch(undefined),
  q: z.string().trim().min(1).max(200).optional().catch(undefined),
  cursor: z.string().trim().min(1).max(200).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined)
});

function buildRewardsFilters(req: Request, limitOverride?: number): RewardsDataFilters {
  const query = rewardsFilterQuerySchema.parse(req.query ?? {});
  const filters: RewardsDataFilters = {};

  if (query.status) filters.status = query.status;
  if (query.from) filters.from = query.from;
  if (query.to) filters.to = query.to;
  if (query.q) filters.q = query.q;
  if (query.cursor) filters.cursor = query.cursor;

  if (limitOverride !== undefined) {
    filters.limit = limitOverride;
  } else if (query.limit !== undefined) {
    filters.limit = query.limit;
  }
  return filters;
}

const rewardIdParamsSchema = z.object({ id: z.string().uuid() });

const markIssuedBodySchema = z.object({
  note: z.string().min(10, "Note must be at least 10 characters"),
  providerTxnId: z.string().optional()
});

const manualRewardBodySchema = z
  .object({
    // A learner is identified by phone (what the picker has) or, for
    // backward compatibility, a user id. At least one must be provided.
    userId: z.string().uuid().optional(),
    phone: z.string().min(3).optional(),
    amount: z.number().positive(),
    channel: z.string().min(1).optional(),
    note: z.string().min(10, "Note must be at least 10 characters")
  })
  .refine((value) => Boolean(value.userId) || Boolean(value.phone), {
    message: "Provide a learner (phone or userId) to receive this reward."
  });

adminRouter.get("/users", async (_req, res, next) => {
  try {
    const payload = await getUsersData();
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users/help-requests", async (req, res, next) => {
  // Backs the "Users requesting help" panel on the Overview page. Ordered by
  // flaggedAt (NOT updatedAt, which any unrelated write would bump) so the
  // list genuinely shows the most recent requests.
  try {
    const parsed = helpRequestsQuerySchema.safeParse(req.query);
    const limit = parsed.success ? parsed.data.limit : 5;
    const rows = await prisma.user.findMany({
      where: { flaggedForFollowUp: true },
      orderBy: [{ flaggedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      take: limit,
      select: {
        phone: true,
        name: true,
        language: true,
        location: true,
        followUpNote: true,
        flaggedAt: true
      }
    });
    res.status(200).json({
      requests: rows.map((row) => ({
        phone: row.phone,
        name: row.name,
        language: row.language,
        location: row.location,
        // Only the newest note line is useful in a 5-row panel; the drawer
        // shows the full history.
        latestNote:
          (row.followUpNote ?? "").trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "",
        flaggedAt: row.flaggedAt ? row.flaggedAt.toISOString() : null
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users/export", async (_req, res, next) => {
  try {
    const data = await getUsersData();
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = "Name,Phone,Location,Language,Completion,Status,Flagged,Follow-up Note";
    const rows = data.users.map((u) =>
      [u.name, u.phone, u.location, u.language, u.completion, u.status, u.flaggedForFollowUp ? "Yes" : "No", ""]
        .map(escape)
        .join(",")
    );
    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send([header, ...rows].join("\n"));
  } catch (error) {
    next(error);
  }
});

const flagBodySchema = z.object({
  flagged: z.boolean(),
  note: z.string().max(500).optional()
});

// Contact Learner: exactly one of free text or a template key. Free text is
// only deliverable inside WhatsApp's 24-hour customer-service window; the
// route enforces that below, this schema only enforces the shape.
const messageBodySchema = z
  .object({
    text: z.string().trim().min(1).max(1024).optional(),
    templateKey: z.string().trim().min(1).max(200).optional()
  })
  .refine((value) => Boolean(value.text) !== Boolean(value.templateKey), {
    message: "Provide either text or templateKey, not both."
  });

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

adminRouter.post("/users/:phone/message", requireWriteAccess, async (req, res, next) => {
  try {
    const body = messageBodySchema.parse(req.body);
    const phone = String(req.params.phone);
    const user = await prisma.user.findUnique({ where: { phone }, include: { session: true } });
    if (!user) {
      res.status(404).json({ message: "Learner not found." });
      return;
    }

    // WhatsApp compliance: outside the 24-hour customer-service window Meta
    // only delivers pre-approved template messages. The learner's last inbound
    // activity is approximated by their session's lastUpdatedAt (bumped on
    // every processed inbound message).
    const lastActivity = user.session?.lastUpdatedAt?.getTime() ?? 0;
    const withinWindow = Date.now() - lastActivity < SERVICE_WINDOW_MS;
    if (body.text && !withinWindow) {
      res.status(409).json({
        message:
          "This learner last messaged more than 24 hours ago, so WhatsApp will only deliver an approved template. Choose a template instead."
      });
      return;
    }

    let payload: OutreachPayload;
    let logBody: string;
    if (body.text) {
      payload = { kind: "text", text: body.text };
      logBody = body.text;
    } else {
      // Templates are config-driven (Settings → Options → whatsapp.outreach_templates):
      // value = the approved Meta template name, metadata.languageCode = its locale.
      const template = getRuntimeOptionSet("whatsapp.outreach_templates").find(
        (item) => item.enabled && item.value === body.templateKey
      );
      if (!template) {
        res.status(400).json({
          message:
            "Unknown template. Configure approved outreach templates under Settings → Options (whatsapp.outreach_templates)."
        });
        return;
      }
      const languageCode =
        typeof template.metadata?.languageCode === "string" ? template.metadata.languageCode : "en";
      payload = { kind: "template", templateName: template.value, languageCode };
      logBody = template.value;
    }

    const result = await sendWhatsAppOutreach(phone, payload);
    const sentBy = req.authUser?.id ?? "unknown";
    await prisma.outboundMessage.create({
      data: {
        phone,
        kind: payload.kind,
        body: logBody,
        status: result.status,
        detail: result.status === "sent" ? result.providerMessageId : result.reason,
        sentBy
      }
    });
    console.log(
      JSON.stringify({
        event: "admin.outreach",
        phone,
        kind: payload.kind,
        status: result.status,
        actorId: sentBy,
        updatedAt: new Date().toISOString()
      })
    );

    if (result.status === "sent") {
      res.status(200).json({ message: "Message sent.", result });
    } else {
      res.status(502).json({ message: result.reason });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request." });
      return;
    }
    next(error);
  }
});

adminRouter.get("/users/:phone/messages", async (req, res, next) => {
  // Recent outreach history for the Contact Learner drawer.
  try {
    const rows = await prisma.outboundMessage.findMany({
      where: { phone: String(req.params.phone) },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    res.status(200).json({
      messages: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        body: row.body,
        status: row.status,
        detail: row.detail,
        sentBy: row.sentBy,
        createdAt: row.createdAt.toISOString()
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/users/:phone/flag", requireWriteAccess, async (req, res, next) => {
  try {
    const phone = String(req.params.phone);
    const body = flagBodySchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (!existing) {
      res.status(404).json({ message: "Learner not found." });
      return;
    }
    const updated = await prisma.user.update({
      where: { phone },
      data: {
        flaggedForFollowUp: body.flagged,
        followUpNote: body.flagged ? body.note ?? null : null
      }
    });
    console.log(JSON.stringify({
      event: "users.admin_action",
      action: body.flagged ? "flag" : "unflag",
      phone,
      note: body.flagged ? body.note ?? null : null,
      actorId: req.authUser?.id ?? null,
      actorRole: req.authUser?.role ?? null,
      updatedAt: new Date().toISOString()
    }));
    res.status(200).json({
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      location: updated.location,
      language: updated.language,
      status: updated.status,
      flaggedForFollowUp: updated.flaggedForFollowUp,
      followUpNote: updated.followUpNote,
      createdAt: updated.createdAt.toISOString()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request payload." });
      return;
    }
    next(error);
  }
});

adminRouter.get("/users/:phone", async (req, res, next) => {
  try {
    const phone = String(req.params.phone);
    const detail = await getLearnerDetail(phone);
    if (!detail) {
      res.status(404).json({ message: "Learner not found." });
      return;
    }
    res.status(200).json(detail);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/analytics", async (_req, res, next) => {
  try {
    const payload = await getAnalyticsData();
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/analytics/export", async (_req, res, next) => {
  // Same figures the /analytics endpoint computes, as a CSV: one row per state
  // plus an Overall row. Overall counts are summed from the state funnels when
  // a per-state breakdown exists (the live events provider); otherwise they are
  // left blank rather than invented (the snapshot provider has only rates).
  try {
    const data = await getAnalyticsData();
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = "Scope,Registered,Completed,Passed,Completion Rate,Pass Rate,Registration Rate";
    const hasStates = data.stateFunnels.length > 0;
    const sum = (pick: (f: (typeof data.stateFunnels)[number]) => number) =>
      hasStates ? data.stateFunnels.reduce((total, f) => total + pick(f), 0) : "";
    const overall = [
      "Overall",
      sum((f) => f.registered),
      sum((f) => f.completed),
      sum((f) => f.passed),
      data.completionRate,
      data.passRate,
      data.registrationRate
    ];
    const stateRows = data.stateFunnels.map((f) => [
      f.state,
      f.registered,
      f.completed,
      f.passed,
      f.completionRate,
      f.passRate,
      ""
    ]);
    const lines = [overall, ...stateRows].map((row) => row.map(escape).join(","));
    const filename = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send([header, ...lines].join("\n"));
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/content", async (_req, res, next) => {
  try {
    const payload = await getContentData();
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/rewards", async (req, res, next) => {
  try {
    const filters = buildRewardsFilters(req);
    const data = await getRewardsData(filters);
    const config = getRuntimePayoutsConfig();
    const activeProvider = config
      ? { key: config.provider, sandbox: config.sandbox }
      : null;
    // Manual-reward defaults come from the published Reward Rule (admin-set),
    // so the UI never hardcodes the amount/channel.
    const rule = getRuntimeRewardRules();
    const defaults = rule ? { amount: rule.amount, channel: rule.channel } : null;
    res.status(200).json({
      ...data,
      meta: { ...data.meta, activeProvider, defaults }
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/rewards/export", async (req, res, next) => {
  try {
    const data = await getRewardsData(buildRewardsFilters(req, 10000));
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const header =
      "Learner,Phone,Module,Amount,Currency,Channel,Status,Created (UTC),Issued (UTC),Provider Txn ID,Failure Reason,Actor Note";
    const rows = data.rewards.map((r) =>
      [
        r.learner,
        r.learnerPhone,
        r.module,
        r.amount,
        r.currency,
        r.channel,
        r.status,
        r.createdAt,
        r.issuedAt ?? "",
        r.providerTxnId ?? "",
        r.failureReason ?? "",
        r.noteFromActor ?? ""
      ]
        .map(escape)
        .join(",")
    );
    const filename = `rewards-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send([header, ...rows].join("\n"));
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/reports", async (_req, res, next) => {
  try {
    const payload = await getReportsData();
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

// ---- On-demand report generation (CS-6) ----
// Bridges the dashboard (admin JWT) to the existing export pipeline in
// reports/export-service.ts, which already renders real DB-backed rows for the
// three report types. The donor-facing reportsRouter keeps its own token
// surface; these routes are for operators inside the admin app.

const generateReportSchema = z.object({
  reportType: z.enum(["donor_summary", "module_completion_detail", "rewards_issuance_log"])
});

/** Job shape for the UI - never includes the (potentially large) content. */
function toJobSummary(job: {
  exportId: string;
  reportType: string;
  format: string;
  requestedBy: string;
  status: string;
  fileName?: string;
  error?: string;
  createdAt: string;
}) {
  return {
    exportId: job.exportId,
    reportType: job.reportType,
    format: job.format,
    requestedBy: job.requestedBy,
    status: job.status,
    fileName: job.fileName ?? null,
    error: job.error ?? null,
    createdAt: job.createdAt
  };
}

adminRouter.post("/reports/generate", requireWriteAccess, async (req, res, next) => {
  try {
    const body = generateReportSchema.parse(req.body);
    // schemaVersion is a server-side concern - resolve it from the registry so
    // the admin UI never has to know or hardcode it.
    const schema = listReportSchemas().find((item) => item.reportType === body.reportType);
    if (!schema) {
      res.status(400).json({ message: "Unknown report type." });
      return;
    }
    const result = await requestReportExport({
      requestId: randomUUID(),
      reportType: body.reportType,
      format: "csv",
      schemaVersion: schema.schemaVersion,
      requestedBy: req.authUser?.id ?? "unknown"
    });
    console.log(
      JSON.stringify({
        event: "admin.report.generate",
        reportType: body.reportType,
        status: result.job.status,
        actorId: req.authUser?.id ?? null,
        updatedAt: new Date().toISOString()
      })
    );
    if (result.status === "failed") {
      res.status(502).json({ message: result.job.error ?? "Report generation failed.", job: toJobSummary(result.job) });
      return;
    }
    res.status(201).json({ message: "Report generated.", job: toJobSummary(result.job) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request." });
      return;
    }
    next(error);
  }
});

adminRouter.get("/reports/exports", (_req, res) => {
  // NOTE: jobs live in memory (GAP-D1: regenerable artifacts) - history resets
  // when the instance recycles. Reports can simply be generated again.
  res.status(200).json({ jobs: listReportExports().map(toJobSummary) });
});

adminRouter.get("/reports/exports/:id/download", (req, res) => {
  const job = getReportExportById(String(req.params.id));
  if (!job || job.status !== "Ready" || !job.content) {
    res.status(404).json({
      message:
        "Export not found. Generated reports are kept in memory only - if the service restarted, generate the report again."
    });
    return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${job.fileName ?? "report.csv"}"`);
  res.status(200).send(job.content);
});

adminRouter.post("/rewards/:id/retry", requireWriteAccess, async (req, res, next) => {
  try {
    const { id } = rewardIdParamsSchema.parse(req.params);
    const existing = await prisma.reward.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: "Reward not found" });
      return;
    }
    if (existing.status !== "Pending" && existing.status !== "Failed") {
      res.status(409).json({ message: "Only Pending or Failed rewards can be retried" });
      return;
    }
    await prisma.reward.update({
      where: { id },
      data: {
        status: "Pending",
        retryCount: 0,
        nextAttemptAt: null,
        failureReason: null,
        attemptInProgress: false
      }
    });
    console.log(
      JSON.stringify({
        event: "payouts.admin_action",
        action: "retry",
        rewardId: id,
        actorId: req.authUser?.id ?? null,
        updatedAt: new Date().toISOString(),
        actorRole: req.authUser?.role ?? null
      })
    );
    res.status(200).json({ message: "Queued for next dispatch (≤5 min)" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    next(error);
  }
});

adminRouter.post("/rewards/:id/mark-issued", requireWriteAccess, async (req, res, next) => {
  try {
    const { id } = rewardIdParamsSchema.parse(req.params);
    const body = markIssuedBodySchema.parse(req.body);
    const existing = await prisma.reward.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: "Reward not found" });
      return;
    }
    await prisma.reward.update({
      where: { id },
      data: {
        status: "Issued",
        issuedAt: new Date(),
        providerTxnId: body.providerTxnId ?? "manual",
        noteFromActor: body.note,
        attemptInProgress: false
      }
    });
    console.log(
      JSON.stringify({
        event: "payouts.admin_action",
        action: "mark_issued",
        rewardId: id,
        actorId: req.authUser?.id ?? null,
        updatedAt: new Date().toISOString(),
        actorRole: req.authUser?.role ?? null,
        note: body.note
      })
    );
    res.status(200).json({ message: "Reward marked as Issued" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    next(error);
  }
});

adminRouter.post("/rewards/manual", requireWriteAccess, async (req, res, next) => {
  try {
    const body = manualRewardBodySchema.parse(req.body);
    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : await prisma.user.findUnique({ where: { phone: body.phone! } });
    if (!user) {
      res.status(404).json({ message: "Learner not found" });
      return;
    }
    const created = await prisma.reward.create({
      data: {
        userId: user.id,
        module: "Manual",
        amount: body.amount,
        channel: body.channel ?? "airtime",
        status: "Pending",
        learnerPhone: user.phone,
        noteFromActor: body.note
      }
    });
    console.log(
      JSON.stringify({
        event: "payouts.admin_action",
        action: "manual_create",
        rewardId: created.id,
        actorId: req.authUser?.id ?? null,
        updatedAt: new Date().toISOString(),
        actorRole: req.authUser?.role ?? null,
        amount: body.amount
      })
    );
    res.status(201).json({ id: created.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    next(error);
  }
});
