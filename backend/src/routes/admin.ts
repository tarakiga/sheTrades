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
import { getRuntimePayoutsConfig } from "../config-platform/runtime-config.js";
import { authenticateJwt } from "../auth/jwt-rbac.js";

export const adminRouter = Router();

// Gate the entire admin data + rewards + users API behind a valid admin
// session JWT (same token the admin login mints and the config-admin router
// already validates). The login/profile routes live on the separate
// adminAuthRouter and are unaffected; the donor-export reportsRouter is
// mounted separately with its own token. The dashboard attaches the stored
// JWT to every /api/admin/* call (see dashboard/lib/admin/api.ts authHeaders).
adminRouter.use(authenticateJwt);

function buildRewardsFilters(req: Request, limitOverride?: number): RewardsDataFilters {
  const filters: RewardsDataFilters = {};
  const statusParam = req.query.status;
  if (statusParam === "Issued" || statusParam === "Pending" || statusParam === "Failed") {
    filters.status = statusParam;
  }
  if (req.query.from) filters.from = new Date(String(req.query.from));
  if (req.query.to) filters.to = new Date(String(req.query.to));
  if (req.query.q) filters.q = String(req.query.q);
  if (req.query.cursor) filters.cursor = String(req.query.cursor);
  if (limitOverride !== undefined) {
    filters.limit = limitOverride;
  } else if (req.query.limit) {
    filters.limit = Number(req.query.limit);
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

adminRouter.post("/users/:phone/flag", async (req, res, next) => {
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
      note: body.flagged ? body.note ?? null : null
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
    res.status(200).json({
      ...data,
      meta: { ...data.meta, activeProvider }
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

adminRouter.post("/rewards/:id/retry", async (req, res, next) => {
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
        actorId: (req as any).adminUser?.id ?? null,
        actorRole: (req as any).adminUser?.role ?? null
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

adminRouter.post("/rewards/:id/mark-issued", async (req, res, next) => {
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
        actorId: (req as any).adminUser?.id ?? null,
        actorRole: (req as any).adminUser?.role ?? null,
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

adminRouter.post("/rewards/manual", async (req, res, next) => {
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
        actorId: (req as any).adminUser?.id ?? null,
        actorRole: (req as any).adminUser?.role ?? null,
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
