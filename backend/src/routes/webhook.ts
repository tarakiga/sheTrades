import { Router } from "express";
import type { Request } from "express";
import crypto from "node:crypto";
import { getRuntimeWhatsAppConfig } from "../config-platform/runtime-config.js";
import { handleWhatsAppWebhook, resetWhatsAppState, getWhatsAppSession } from "../whatsapp/handler.js";
import { authenticateJwt } from "../auth/jwt-rbac.js";

export const webhookRouter = Router();

/**
 * Verify Meta's `X-Hub-Signature-256` HMAC over the raw request body (GAP-A8).
 * The app secret comes from the published WhatsApp config (or WHATSAPP_APP_SECRET).
 * When no secret is configured the check is SKIPPED (fail-open with a warning) so
 * an unconfigured environment still functions; once a secret is set, a missing or
 * mismatched signature is rejected.
 */
function verifyMetaSignature(req: Request): { ok: boolean; skipped: boolean } {
  const appSecret =
    getRuntimeWhatsAppConfig()?.appSecret || process.env.WHATSAPP_APP_SECRET || "";
  if (!appSecret) return { ok: true, skipped: true };

  const header = req.header("x-hub-signature-256") ?? "";
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || !header.startsWith("sha256=")) return { ok: false, skipped: false };

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
  try {
    const received = Buffer.from(header);
    const computed = Buffer.from(expected);
    return {
      ok: received.length === computed.length && crypto.timingSafeEqual(received, computed),
      skipped: false
    };
  } catch {
    return { ok: false, skipped: false };
  }
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
    const isSandbox = req.header("X-SheTrades-Source") === "sandbox";

    // GAP-A8: verify real (non-sandbox) inbound webhooks came from Meta. The
    // dashboard sandbox simulator can't sign requests, so it is exempt (it never
    // delivers real messages).
    if (!isSandbox) {
      const sig = verifyMetaSignature(req);
      if (sig.skipped) {
        console.warn(
          JSON.stringify({
            event: "whatsapp.webhook.signature.skipped",
            reason: "no_app_secret_configured"
          })
        );
      } else if (!sig.ok) {
        console.warn(JSON.stringify({ event: "whatsapp.webhook.signature.invalid" }));
        res.status(401).json({ message: "Invalid webhook signature." });
        return;
      }
    }

    const result = await handleWhatsAppWebhook(req.body, { deliver: !isSandbox });
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
