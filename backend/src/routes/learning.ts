import { Router } from "express";
import { applyProgressUpdate, getUserLearningState } from "../learning/engine.js";
import { hasIssuedRewardForModule, issueReward } from "../rewards/service.js";
import { getRuntimeNumericPolicy } from "../config-platform/runtime-config.js";
import { authenticateJwt } from "../auth/jwt-rbac.js";

export const learningRouter = Router();

// GAP-A6: this legacy in-memory router exposed learner PII (GET /users/:phone)
// and accepted unauthenticated progress writes. Gate each route with
// `authenticateJwt`. Auth is per-route, not router.use — this router is mounted
// at the broad "/api" path, so a router-level guard would reject unrelated
// /api/* requests before they fall through to their own router.
learningRouter.get("/users/:phone", authenticateJwt, (req, res) => {
  const phone = String(req.params.phone);
  const state = getUserLearningState(phone);
  res.status(200).json(state);
});

learningRouter.post("/progress", authenticateJwt, async (req, res, next) => {
  try {
    const result = applyProgressUpdate(req.body);
    const event = req.body as { phone?: string; event?: { moduleId?: number } };

    if (
      result.status === "applied" &&
      typeof event.phone === "string" &&
      typeof event.event?.moduleId === "number"
    ) {
      const moduleId = event.event.moduleId;
      const module = result.state.modules[`module${moduleId}`];
      if (module?.passed && !hasIssuedRewardForModule(event.phone, moduleId)) {
        const rewardAmount = getRuntimeNumericPolicy(
          "policy.rewards.module_completion_amount",
          200
        );
        await issueReward({
          issueId: `${event.phone}:module:${moduleId}:auto`,
          phone: event.phone,
          moduleId,
          amount: rewardAmount,
          mode: "automated",
          channel: "airtime_api",
          reason: "module_completion"
        }).catch(() => {
          // Intentionally non-blocking for progression API response path.
        });
      }
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
