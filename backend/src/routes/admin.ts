import { Router } from "express";
import {
  getAnalyticsData,
  getContentData,
  getReportsData,
  getRewardsData,
  getUsersData
} from "../admin/data.js";

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

adminRouter.get("/rewards", async (_req, res, next) => {
  try {
    const payload = await getRewardsData();
    res.status(200).json(payload);
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
