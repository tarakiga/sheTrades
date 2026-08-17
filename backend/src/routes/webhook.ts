import { Router } from "express";
import type { Request } from "express";
import crypto from "node:crypto";
import { getRuntimeWhatsAppConfig } from "../config-platform/runtime-config.js";
import { handleWhatsAppWebhook, resetWhatsAppState, getWhatsAppSession } from "../whatsapp/handler.js";
import { authenticateJwt } from "../auth/jwt-rbac.js";

export const webhookRouter = Router();

/** Length-safe constant-time compare (timingSafeEqual throws on length mismatch). */
function secretsMatch(supplied: string, expected: string): boolean {
  if (supplied.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Verify Meta's `X-Hub-Signature-256` HMAC over the raw request body (GAP-A8). */
function verifyMetaSignature(req: Request, appSecret: string): boolean {
  const header = req.header("x-hub-signature-256") ?? "";
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
  return secretsMatch(header, expected);
}

type WebhookAuth =
  | { ok: true; sandbox: boolean }
  | { ok: false; status: number; reason: string; message: string };

/**
 * Authenticate an inbound webhook. Every accepted request is either
 * (a) signed by Meta, or (b) an authenticated sandbox simulator call.
 *
 * The sandbox path exists so the dashboard simulator and e2e scripts can drive
 * the bot without Meta's signing key. It USED to be claimed by the
 * `X-SheTrades-Source: sandbox` header alone, which any caller could set — and
 * although sandbox requests never deliver WhatsApp messages, they DO write to
 * the database, so an anonymous caller could mint learners and reward rows
 * pointed at their own phone number (real airtime, once payouts are live).
 * It now additionally requires `X-SheTrades-Sandbox-Token` to match
 * WHATSAPP_SANDBOX_TOKEN; when that env var is unset the sandbox path is
 * disabled outright, so production has no bypass at all.
 *
 * Both paths FAIL CLOSED: an unverifiable request never reaches the handler.
 */
function authenticateWebhook(req: Request): WebhookAuth {
  if (req.header("X-SheTrades-Source") === "sandbox") {
    const expected = process.env.WHATSAPP_SANDBOX_TOKEN ?? "";
    if (!expected) {
      return {
        ok: false,
        status: 403,
        reason: "sandbox_disabled",
        message: "Sandbox webhook access is disabled."
      };
    }
    if (!secretsMatch(req.header("X-SheTrades-Sandbox-Token") ?? "", expected)) {
      return {
        ok: false,
        status: 401,
        reason: "sandbox_token_invalid",
        message: "Invalid sandbox token."
      };
    }
    return { ok: true, sandbox: true };
  }

  const appSecret =
    getRuntimeWhatsAppConfig()?.appSecret || process.env.WHATSAPP_APP_SECRET || "";
  if (!appSecret) {
    // Refuse rather than trust: without the secret we cannot prove the caller
    // is Meta. Set it on the WhatsApp integration config (or
    // WHATSAPP_APP_SECRET) to restore service.
    return {
      ok: false,
      status: 503,
      reason: "no_app_secret_configured",
      message: "Webhook signature verification is not configured."
    };
  }
  if (!verifyMetaSignature(req, appSecret)) {
    return {
      ok: false,
      status: 401,
      reason: "signature_invalid",
      message: "Invalid webhook signature."
    };
  }
  return { ok: true, sandbox: false };
}

webhookRouter.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expectedToken =
    getRuntimeWhatsAppConfig()?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "";

  if (
    mode === "subscribe" &&
    typeof token === "string" &&
    typeof challenge === "string" &&
    expectedToken.length > 0 &&
    token === expectedToken
  ) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ message: "Webhook verification failed." });
});

webhookRouter.post("/whatsapp", async (req, res, next) => {
  try {
    const auth = authenticateWebhook(req);
    if (!auth.ok) {
      console.warn(
        JSON.stringify({ event: "whatsapp.webhook.rejected", reason: auth.reason })
      );
      res.status(auth.status).json({ message: auth.message });
      return;
    }

    const result = await handleWhatsAppWebhook(req.body, { deliver: !auth.sandbox });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// The two endpoints below are admin/debug tools (used by the dashboard
// WhatsApp sandbox simulator) — NOT Meta-facing. They are gated behind an
// admin session JWT so the public webhook surface cannot wipe learner
// sessions or read learner PII. (The Meta GET/POST /whatsapp routes above
// stay public; Meta authenticates via the verify token / signature.)
webhookRouter.post("/whatsapp/reset", authenticateJwt, async (req, res, next) => {
  try {
    await resetWhatsAppState();
    res.status(200).json({ message: "WhatsApp sandbox sessions have been reset." });
  } catch (err) {
    next(err);
  }
});

webhookRouter.get("/whatsapp/session/:phone", authenticateJwt, async (req, res, next) => {
  try {
    const session = await getWhatsAppSession(String(req.params.phone));
    if (!session) {
      res.status(404).json({ message: "Session not found." });
      return;
    }
    res.status(200).json(session);
  } catch (err) {
    next(err);
  }
});
