import { Router } from "express";
import { dispatchTick } from "./worker.js";

export const payoutsRouter = Router();

payoutsRouter.post("/internal/payouts/dispatch", async (req, res, next) => {
  const expected = process.env.PAYOUTS_WORKER_TOKEN;
  const supplied = req.header("X-Internal-Worker-Token");
  if (!expected || supplied !== expected) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  try {
    const summary = await dispatchTick();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});
