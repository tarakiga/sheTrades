import { Router } from "express";
import { dispatchDueSchedules } from "./schedule-service.js";

export const reportSchedulesWorkerRouter = Router();

/**
 * CS-7: Cloud Scheduler tick for scheduled reports - same internal-worker
 * pattern as /internal/payouts/dispatch. REPORTS_WORKER_TOKEN is preferred;
 * falling back to PAYOUTS_WORKER_TOKEN lets the existing Cloud Scheduler
 * secret drive both workers without new secret plumbing (both tokens carry
 * identical trust: internal scheduler-only surfaces).
 */
reportSchedulesWorkerRouter.post("/internal/reports/schedules/dispatch", async (req, res, next) => {
  const expected = process.env.REPORTS_WORKER_TOKEN ?? process.env.PAYOUTS_WORKER_TOKEN;
  const supplied = req.header("X-Internal-Worker-Token");
  if (!expected || supplied !== expected) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  try {
    const summary = await dispatchDueSchedules();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});
