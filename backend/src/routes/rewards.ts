import { Router } from "express";
import { getRewardAuditLog, issueReward, listRewardsByPhone } from "../rewards/service.js";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";

export const rewardsRouter = Router();

// GAP-A6: this legacy in-memory reward router was mounted unauthenticated —
// anyone could issue rewards or read a learner's reward history by phone.
// Gate each route with `authenticateJwt` (issuing also needs an admin role).
// Auth is per-route, not router.use — this router is mounted at the broad
// "/api" path, so a router-level guard would reject unrelated /api/* requests
// before they fall through to their own router.
rewardsRouter.post("/rewards/issue", authenticateJwt, requireRoles(["admin"]), async (req, res, next) => {
  try {
    const result = await issueReward(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

rewardsRouter.get("/rewards/audit", authenticateJwt, (req, res) => {
  const phone = typeof req.query.phone === "string" ? req.query.phone : undefined;
  const audit = getRewardAuditLog(phone);
  res.status(200).json({ audit });
});

rewardsRouter.get("/rewards/:phone", authenticateJwt, (req, res) => {
  const rewards = listRewardsByPhone(String(req.params.phone));
  res.status(200).json({ rewards });
});
