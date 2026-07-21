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

    // Diagnostic: a repeated 535 against a server verified to be correct and
    // reachable means the credentials arriving here are not what the operator
    // believes they typed. Log the SHAPE of the config so that can be checked
    // without anyone pasting a password into a chat or a ticket.
    // Values are never logged — only lengths and simple predicates.
    console.log(
      JSON.stringify({
        event: "integrations.notification_test.shape",
        host: body.config.host,
        port: body.config.port,
        secure: body.config.secure,
        usernameLooksLikeEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.config.username),
        usernameLength: body.config.username.length,
        usernameDomain: body.config.username.split("@")[1] ?? "(none)",
        passwordLength: body.config.password.length,
        passwordHasLeadingOrTrailingSpace:
          body.config.password !== body.config.password.trim(),
        passwordHasNonAscii: /[^\x20-\x7E]/.test(body.config.password),
        fromEmail: body.config.fromEmail
      })
    );

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
