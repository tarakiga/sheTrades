import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import {
  testNotificationConnectionRequestSchema,
  testWhatsAppConnectionRequestSchema
} from "../integrations/contracts.js";
import {
  testNotificationConnection,
  testWhatsAppConnection
} from "../integrations/connection-tests.js";
import { payoutsIntegrationPayloadSchema } from "../payouts/providers/contracts.js";
import { verifyPayoutsConfig } from "../payouts/providers/index.js";

const testPayoutsConnectionRequestSchema = z.object({
  config: payoutsIntegrationPayloadSchema
});

export const integrationsAdminRouter = Router();

integrationsAdminRouter.use(authenticateJwt);
integrationsAdminRouter.use(requireRoles(["admin"]));

integrationsAdminRouter.post("/whatsapp/test", async (req, res, next) => {
  try {
    const body = testWhatsAppConnectionRequestSchema.parse(req.body);
    const result = await testWhatsAppConnection(body.config);
    res.status(200).json({
      message:
        result.status === "connected"
          ? "WhatsApp connection test succeeded."
          : "WhatsApp connection test failed.",
      result
    });
  } catch (error) {
    next(error);
  }
});

integrationsAdminRouter.post("/notification/test", async (req, res, next) => {
  try {
    const body = testNotificationConnectionRequestSchema.parse(req.body);

    const result = await testNotificationConnection(body.config);
    res.status(200).json({
      message:
        result.status === "connected"
          ? "Notification connection test succeeded."
          : "Notification connection test failed.",
      result
    });
  } catch (error) {
    next(error);
  }
});

integrationsAdminRouter.post("/payouts/test", async (req, res, next) => {
  try {
    const body = testPayoutsConnectionRequestSchema.parse(req.body);
    const result = await verifyPayoutsConfig(body.config);
    res.status(200).json({
      message:
        result.status === "healthy"
          ? "Payouts connection test succeeded."
          : result.status === "degraded"
            ? "Payouts connection responded with warnings."
            : "Payouts connection test failed.",
      result
    });
  } catch (error) {
    next(error);
  }
});

integrationsAdminRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Invalid integration connection test payload.",
      details: error.issues.map((issue) => issue.message)
    });
    return;
  }
  next(error);
});
