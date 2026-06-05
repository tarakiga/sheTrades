import express from "express";
import { adminRouter } from "./routes/admin.js";
import { adminAuthRouter } from "./routes/admin-auth.js";
import { adminTeamRouter } from "./routes/admin-team.js";
import { getReadiness } from "./health/readiness.js";
import { webhookRouter } from "./routes/webhook.js";
import { learningRouter } from "./routes/learning.js";
import { rewardsRouter } from "./routes/rewards.js";
import { contentRouter } from "./routes/content.js";
import { reportsRouter } from "./routes/reports.js";
import { configAdminRouter } from "./routes/config-admin.js";
import { configPublicRouter } from "./routes/config-public.js";
import { integrationsAdminRouter } from "./routes/integrations-admin.js";
import { translationRequestsRouter } from "./routes/translation-requests.js";
import { payoutsRouter } from "./payouts/routes.js";

const DEFAULT_LOCAL_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001"
];

function getAllowedCorsOrigins() {
  const configuredOrigins = (process.env.BACKEND_CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return new Set(configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_LOCAL_CORS_ORIGINS);
}

export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedCorsOrigins();
  const isProduction = process.env.NODE_ENV === "production";

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowRequestOrigin =
      typeof origin === "string" && (!isProduction || allowedOrigins.has(origin));

    if (allowRequestOrigin && typeof origin === "string") {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization, content-type, x-admin-role, x-admin-token, x-shetrades-source"
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

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

  app.use("/api/admin", adminAuthRouter);
  // Mount the admin-team manager before the generic admin data router so
  // /api/admin/team is handled by its own role-gated router rather than
  // falling through adminRouter's authenticateJwt middleware first.
  app.use("/api/admin/team", adminTeamRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/config/admin", configAdminRouter);
  app.use("/api/config/public", configPublicRouter);
  app.use("/api/integrations/admin", integrationsAdminRouter);
  app.use("/api", learningRouter);
  app.use("/api", rewardsRouter);
  app.use("/api", contentRouter);
  app.use("/api", reportsRouter);
  app.use("/api", translationRequestsRouter);
  app.use("/webhook", webhookRouter);
  app.use("/", payoutsRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled express error:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = error instanceof Error && error.message.includes("not found") ? 404 : 500;
    res.status(status).json({ message });
  });

  return app;
}
