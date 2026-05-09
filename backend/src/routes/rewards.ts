import { Router } from "express";
import { getRewardAuditLog, issueReward, listRewardsByPhone } from "../rewards/service.js";

export const rewardsRouter = Router();

rewardsRouter.post("/rewards/issue", async (req, res, next) => {
  try {
    const result = await issueReward(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

rewardsRouter.get("/rewards/audit", (req, res) => {
  const phone = typeof req.query.phone === "string" ? req.query.phone : undefined;
  const audit = getRewardAuditLog(phone);
  res.status(200).json({ audit });
});

rewardsRouter.get("/rewards/:phone", (req, res) => {
  const rewards = listRewardsByPhone(req.params.phone);
  res.status(200).json({ rewards });
});
