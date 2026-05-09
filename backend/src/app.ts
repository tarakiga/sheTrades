import express from "express";
import { adminRouter } from "./routes/admin.js";
import { getReadiness } from "./health/readiness.js";
import { webhookRouter } from "./routes/webhook.js";
import { learningRouter } from "./routes/learning.js";
import { rewardsRouter } from "./routes/rewards.js";
import { contentRouter } from "./routes/content.js";
import { reportsRouter } from "./routes/reports.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "shetrades-backend" });
  });

  app.get("/ready", async (_req, res, next) => {
    try {
      const readiness = await getReadiness();
      res.status(readiness.ok ? 200 : 503).json(readiness);
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/admin", adminRouter);
  app.use("/api", learningRouter);
  app.use("/api", rewardsRouter);
  app.use("/api", contentRouter);
  app.use("/api", reportsRouter);
  app.use("/webhook", webhookRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ message });
  });

  return app;
}
