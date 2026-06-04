import { getRuntimeWhatsAppConfig } from "../config-platform/runtime-config.js";

export type WhatsAppListSpec = {
  button: string;
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>;
};

export type OutboundReply = {
  text: string;
  buttons?: string[];
  list?: WhatsAppListSpec;
};

const BUTTON_TITLE_MAX = 20;
const ROW_TITLE_MAX = 24;

function clip(value: string, max: number): string {
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
