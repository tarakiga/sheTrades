import nodemailer from "nodemailer";
import type {
  NotificationIntegrationPayload,
  WhatsAppIntegrationPayload
} from "../config-platform/contracts.js";
import type { TestIntegrationResult } from "./contracts.js";

type WhatsAppDependencies = {
  fetchImpl?: typeof fetch;
};

type NotificationDependencies = {
  createTransport?: typeof nodemailer.createTransport;
};

function nowIso() {
  return new Date().toISOString();
}

function toDetails(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export async function testWhatsAppConnection(
  config: WhatsAppIntegrationPayload,
  dependencies: WhatsAppDependencies = {}
): Promise<TestIntegrationResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}`);
    url.searchParams.set("fields", "display_phone_number,verified_name");

    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`
      },
      signal: controller.signal
    });

    const raw = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      return {
        provider: "meta_whatsapp_cloud",
        status: "failed",
        summary: "WhatsApp connection failed.",
        details:
          toDetails(parsed?.error) ??
          `Meta returned status ${response.status}${raw ? `: ${raw.slice(0, 180)}` : ""}`,
        testedAt: nowIso()
      };
    }

    const displayPhone =
      typeof parsed?.display_phone_number === "string" && parsed.display_phone_number.trim().length > 0
        ? parsed.display_phone_number.trim()
        : config.phoneNumberId;

    return {
      provider: "meta_whatsapp_cloud",
      status: "connected",
      summary: `WhatsApp connected for ${displayPhone}.`,
      details:
        typeof parsed?.verified_name === "string" && parsed.verified_name.trim().length > 0
          ? `Verified name: ${parsed.verified_name.trim()}`
          : undefined,
      testedAt: nowIso()
    };
  } catch (error) {
    return {
      provider: "meta_whatsapp_cloud",
      status: "failed",
      summary: "WhatsApp connection failed.",
      details: error instanceof Error ? error.message : String(error),
      testedAt: nowIso()
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testNotificationConnection(
  config: NotificationIntegrationPayload,
  dependencies: NotificationDependencies = {}
): Promise<TestIntegrationResult> {
  const createTransport = dependencies.createTransport ?? nodemailer.createTransport;

  try {
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password
      },
      connectionTimeout: 5000
    });

    await transporter.verify();

    return {
      provider: "smtp",
      status: "connected",
      summary: `SMTP connected to ${config.host}:${config.port}.`,
      details: `Messages will send from ${config.fromEmail}.`,
      testedAt: nowIso()
    };
  } catch (error) {
    return {
      provider: "smtp",
      status: "failed",
      summary: "SMTP connection failed.",
      details: error instanceof Error ? error.message : String(error),
      testedAt: nowIso()
    };
  }
}
