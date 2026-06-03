import { Router } from "express";
import {
  getAnalyticsData,
  getContentData,
  getReportsData,
  getRewardsData,
  getUsersData
} from "../admin/data.js";
import { getRuntimePayoutsConfig } from "../config-platform/runtime-config.js";

export const adminRouter = Router();

adminRouter.get("/users", async (_req, res, next) => {
  try {
    const payload = await getUsersData();
    res.status(200).json(payload);
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
    const filters: Parameters<typeof getRewardsData>[0] = {};
    const statusParam = req.query.status;
    if (statusParam === "Issued" || statusParam === "Pending" || statusParam === "Failed") {
      filters.status = statusParam;
    }
    if (req.query.from) filters.from = new Date(String(req.query.from));
    if (req.query.to) filters.to = new Date(String(req.query.to));
    if (req.query.q) filters.q = String(req.query.q);
    if (req.query.cursor) filters.cursor = String(req.query.cursor);
    if (req.query.limit) filters.limit = Number(req.query.limit);

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

adminRouter.get("/reports", async (_req, res, next) => {
  try {
    const payload = await getReportsData();
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});
