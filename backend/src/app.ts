import express from "express";
import { adminRouter } from "./routes/admin.js";
import { adminAuthRouter } from "./routes/admin-auth.js";
import { adminTeamRouter } from "./routes/admin-team.js";
import { translationRouter } from "./routes/translation.js";
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
import { certificatePublicRouter } from "./certificates/routes-public.js";
import { certificateAdminRouter } from "./certificates/routes-admin.js";
import { certificateAssetRouter } from "./certificates/routes-assets.js";
import { certificateTemplateRouter } from "./certificates/routes-template.js";
import { reportSchedulesWorkerRouter } from "./reports/schedule-routes.js";

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

  // Behind Cloud Run every request arrives from Google's front end, so without
  // this `req.ip` is that proxy for EVERY caller. Trusting exactly one hop makes
  // Express skip the nearest proxy and read the address it appended, rather than
  // the leftmost X-Forwarded-For entry — which a client can forge freely.
  //
  // Login throttling is keyed on the EMAIL, not on this, precisely because a
  // mis-derived address would let one attacker lock out every admin at once.
  // The address is recorded on auth logs for forensics only; treat it as a hint,
  // not as an authenticated identity.
  app.set("trust proxy", 1);

  // Capture the raw request bytes so the WhatsApp webhook can verify Meta's
  // X-Hub-Signature-256 HMAC (GAP-A8) — the parsed JSON can't be re-serialized
  // byte-for-byte.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );

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
  // Same reasoning as adminTeamRouter above: mount the translation admin API
  // at its own prefix before the generic admin data router, so it is handled
  // by its own JWT + editor/admin gating rather than falling through
  // adminRouter's authenticateJwt middleware first.
  app.use("/api/admin/translation", translationRouter);
  // Before the general adminRouter so these paths are matched here rather
  // than falling through to it.
  app.use("/api/admin", certificateAdminRouter);
  // The template document's own router: authoring, preview and publish. Kept
  // apart from the router above because that one administers ISSUED
  // certificates, and these two are edited for entirely different reasons.
  app.use("/api/admin", certificateTemplateRouter);
  // Separate again because its upload route parses a RAW body rather than
  // JSON, and that parser is mounted per-route inside it.
  app.use("/api/admin", certificateAssetRouter);
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
  // Public, unauthenticated: /c/<id>.png is the URL Meta fetches to attach a
  // certificate to a WhatsApp message, and /c/<id> is the page an employer
  // opens. Route order INSIDE this router is load-bearing; see routes-public.ts.
  app.use("/", certificatePublicRouter);
  app.use("/", reportSchedulesWorkerRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled express error:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = error instanceof Error && error.message.includes("not found") ? 404 : 500;
    res.status(status).json({ message });
  });

  return app;
}
