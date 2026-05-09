import { Router } from "express";
import { applyProgressUpdate, getUserLearningState } from "../learning/engine.js";
import { hasIssuedRewardForModule, issueReward } from "../rewards/service.js";

export const learningRouter = Router();

learningRouter.get("/users/:phone", (req, res) => {
  const phone = req.params.phone;
  const state = getUserLearningState(phone);
  res.status(200).json(state);
});

learningRouter.post("/progress", async (req, res, next) => {
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
        await issueReward({
          issueId: `${event.phone}:module:${moduleId}:auto`,
          phone: event.phone,
          moduleId,
          amount: 200,
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
