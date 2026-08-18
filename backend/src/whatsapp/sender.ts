import { getRuntimeWhatsAppConfig } from "../config-platform/runtime-config.js";
import { WHATSAPP_LIMITS } from "./constraints.js";

export type WhatsAppListSpec = {
  button: string;
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>;
};

export type OutboundReply = {
  text: string;
  buttons?: string[];
  list?: WhatsAppListSpec;
};

// Re-exported from constraints.ts (the single source of truth) so existing
// importers keep working. The inbound handler mirrors this clipping when
// matching a tapped reply back to an option (a tapped option longer than the
// limit comes back truncated).
export const BUTTON_TITLE_MAX = WHATSAPP_LIMITS.buttonTitle;
export const ROW_TITLE_MAX = WHATSAPP_LIMITS.listRowTitle;

export function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function buildMessage(to: string, reply: OutboundReply): Record<string, unknown> {
  if (reply.list) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: reply.text },
        action: {
          button: clip(reply.list.button, BUTTON_TITLE_MAX),
          sections: reply.list.sections.map((s) => ({
            ...(s.title ? { title: clip(s.title, ROW_TITLE_MAX) } : {}),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: clip(r.title, ROW_TITLE_MAX),
              ...(r.description ? { description: r.description } : {})
            }))
          }))
        }
      }
    };
  }
  if (reply.buttons && reply.buttons.length > 0) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: reply.text },
        action: {
          buttons: reply.buttons.slice(0, 3).map((b, i) => ({
            type: "reply",
            reply: { id: String(i + 1), title: clip(b, BUTTON_TITLE_MAX) }
          }))
        }
      }
    };
  }
  return { messaging_product: "whatsapp", to, type: "text", text: { body: reply.text } };
}

export type OutreachPayload =
  | { kind: "text"; text: string }
  | { kind: "template"; templateName: string; languageCode: string }
  // Meta FETCHES this URL itself, so there is no media-upload step: the same
  // public route serves browsers and the Cloud API.
  | { kind: "image"; link: string; caption?: string | undefined };

function buildOutreachMessage(to: string, payload: OutreachPayload): Record<string, unknown> {
  switch (payload.kind) {
    case "text":
      return { messaging_product: "whatsapp", to, type: "text", text: { body: payload.text } };
    case "template":
      return {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: payload.templateName, language: { code: payload.languageCode } }
      };
    case "image":
      return {
        messaging_product: "whatsapp",
        to,
        type: "image",
        // Conditional spread rather than `caption: payload.caption`: Meta
        // rejects an empty caption, and an absent key is the only shape that
        // reliably means "no caption" once this crosses JSON.
        image: { link: payload.link, ...(payload.caption ? { caption: payload.caption } : {}) }
      };
  }
}

export type OutreachResult =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "failed"; reason: string };

/**
 * Operator-initiated outreach (Contact Learner). Unlike sendWhatsAppMessage -
 * which swallows failures because a bot reply has no one to report to - this
 * RETURNS the outcome so the admin UI can show whether the message was
 * delivered to Meta and why not. Template sends are v1: pre-approved template
 * name + language, no body variables yet.
 */
export async function sendWhatsAppOutreach(
  to: string,
  payload: OutreachPayload
): Promise<OutreachResult> {
  const cfg = getRuntimeWhatsAppConfig();
  if (!cfg) {
    return { status: "failed", reason: "No WhatsApp integration is published." };
  }
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const message = buildOutreachMessage(to, payload);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      console.warn(
        JSON.stringify({ event: "whatsapp.outreach.failed", to, status: response.status, detail: text.slice(0, 300) })
      );
      return { status: "failed", reason: `Meta rejected the send (HTTP ${response.status}): ${text.slice(0, 200)}` };
    }
    let providerMessageId: string | null = null;
    try {
      const parsed = JSON.parse(text) as { messages?: Array<{ id?: string }> };
      providerMessageId = parsed.messages?.[0]?.id ?? null;
    } catch {
      providerMessageId = null;
    }
    console.log(JSON.stringify({ event: "whatsapp.outreach.ok", to, kind: payload.kind }));
    return { status: "sent", providerMessageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(JSON.stringify({ event: "whatsapp.outreach.failed", to, reason }));
    return { status: "failed", reason };
  }
}

export async function sendWhatsAppMessage(to: string, reply: OutboundReply): Promise<void> {
  const cfg = getRuntimeWhatsAppConfig();
  if (!cfg) {
    console.log(JSON.stringify({ event: "whatsapp.send.skipped", reason: "no_published_config", to }));
    return;
  }
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const message = buildMessage(to, reply);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(JSON.stringify({ event: "whatsapp.send.failed", to, status: response.status, detail: detail.slice(0, 300) }));
      return;
    }
    console.log(JSON.stringify({ event: "whatsapp.send.ok", to, type: (message as { type?: string }).type }));
  } catch (error) {
    console.warn(JSON.stringify({ event: "whatsapp.send.failed", to, reason: error instanceof Error ? error.message : String(error) }));
  }
}
