import { Router } from "express";
import { getRuntimeWhatsAppConfig } from "../config-platform/runtime-config.js";
import { handleWhatsAppWebhook, resetWhatsAppState, getWhatsAppSession } from "../whatsapp/handler.js";

export const webhookRouter = Router();

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

webhookRouter.post("/whatsapp", (req, res) => {
  const result = handleWhatsAppWebhook(req.body);
  res.status(200).json(result);
});

webhookRouter.post("/whatsapp/reset", (req, res) => {
  resetWhatsAppState();
  res.status(200).json({ message: "WhatsApp sandbox sessions have been reset." });
});

webhookRouter.get("/whatsapp/session/:phone", (req, res) => {
  const session = getWhatsAppSession(req.params.phone);
  if (!session) {
    res.status(404).json({ message: "Session not found." });
    return;
  }
  res.status(200).json(session);
});
