import { z } from "zod";
import { getRuntimeOptionSet, getRuntimeText } from "../config-platform/runtime-config.js";

export type ConversationState = "awaiting_name" | "awaiting_language" | "main_menu" | "module_menu";

type UserSession = {
  phone: string;
  name?: string;
  language?: "en" | "pcm" | "ig";
  state: ConversationState;
  namePrompted?: boolean;
  lastUpdatedAt: string;
};

type InboundMessage = {
  id: string;
  from: string;
  text: string;
};

export type WhatsAppWebhookResult =
  | {
      status: "ignored";
      reason: string;
    }
  | {
      status: "duplicate";
      phone: string;
      messageId: string;
      state: ConversationState;
    }
  | {
      status: "processed";
      phone: string;
      messageId: string;
      state: ConversationState;
      reply: string;
    };

const webhookPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              messages: z
                .array(
                  z.object({
                    id: z.string().min(1),
                    from: z.string().min(1),
                    text: z
                      .object({
                        body: z.string().optional()
                      })
                      .optional()
                  })
                )
                .optional()
            })
          })
        )
      })
    )
    .optional()
});

const sessions = new Map<string, UserSession>();
const processedMessageIds = new Set<string>();

function nowIso() {
  return new Date().toISOString();
}

function toLanguage(raw: string): "en" | "pcm" | "ig" | null {
  const normalized = raw.trim().toLowerCase();
  const configured = getRuntimeOptionSet("bot.language_options")
    .filter((item) => item.enabled)
    .map((item) => {
      const aliases =
        item.metadata &&
        typeof item.metadata === "object" &&
        Array.isArray((item.metadata as Record<string, unknown>).aliases)
          ? ((item.metadata as Record<string, unknown>).aliases as unknown[])
              .filter((row): row is string => typeof row === "string")
              .map((row) => row.trim().toLowerCase())
          : [];
      return {
        value: item.value.trim().toLowerCase(),
        aliases
      };
    });
  for (const option of configured) {
    if (option.value === "en" || option.value === "pcm" || option.value === "ig") {
      if (normalized === option.value || option.aliases.includes(normalized)) {
        return option.value;
      }
    }
  }
  if (["en", "english", "1"].includes(normalized)) return "en";
  if (["pcm", "pidgin", "2"].includes(normalized)) return "pcm";
  if (["ig", "igbo", "3"].includes(normalized)) return "ig";
  return null;
}

function languageLabel(language: "en" | "pcm" | "ig") {
  if (language === "en") return getRuntimeText("bot.language.en", "English");
  if (language === "pcm") return getRuntimeText("bot.language.pcm", "Pidgin");
  return getRuntimeText("bot.language.ig", "Igbo");
}

function mainMenuText(name: string) {
  return getRuntimeText(
    "bot.main_menu",
    `Welcome ${name}. Main Menu:\n1. Start Module 1\n2. My Progress\n3. Change Language`
  ).replace("{name}", name);
}

function extractInboundMessage(payload: unknown): InboundMessage | null {
  const parsed = webhookPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const message = parsed.data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return null;

  return {
    id: message.id,
    from: message.from,
    text: message.text?.body?.trim() ?? ""
  };
}

function getOrCreateSession(phone: string): UserSession {
  const existing = sessions.get(phone);
  if (existing) return existing;

  const created: UserSession = {
    phone,
    state: "awaiting_name",
    lastUpdatedAt: nowIso()
  };
  sessions.set(phone, created);
  return created;
}

function transition(
  session: UserSession,
  text: string
): { state: ConversationState; reply: string } {
  const safeText = text.trim();
  const normalized = safeText.toLowerCase();

  if (session.state === "awaiting_name") {
    const greetings = ["hi", "hello", "hey", "start", "menu", "yo", "hola", "begin", "ping", "test", "shetrades"];
    const cleanText = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    const words = cleanText.split(/\s+/);
    const isGreeting = words.some(w => greetings.includes(w));

    if (!safeText || (isGreeting && !session.namePrompted)) {
      session.namePrompted = true;
      session.lastUpdatedAt = nowIso();
      return {
        state: "awaiting_name",
        reply: getRuntimeText(
          "bot.awaiting_name.prompt",
          "Welcome to SheTrades. Please reply with your full name to begin."
        )
      };
    }

    session.name = safeText;
    session.state = "awaiting_language";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: getRuntimeText(
        "bot.awaiting_language.prompt",
        `Thanks ${safeText}. Choose language:\n1. English (EN)\n2. Pidgin (PCM)\n3. Igbo (IG)`
      ).replace("{name}", safeText)
    };
  }

  if (session.state === "awaiting_language") {
    const language = toLanguage(normalized);
    if (!language) {
      return {
        state: "awaiting_language",
        reply: getRuntimeText(
          "bot.awaiting_language.invalid",
          "Invalid language option. Reply with 1 (EN), 2 (PCM), or 3 (IG)."
        )
      };
    }

    session.language = language;
    session.state = "main_menu";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: getRuntimeText(
        "bot.main_menu.language_set",
        `${mainMenuText(session.name ?? "Learner")}\nLanguage set: ${languageLabel(language)}`
      )
        .replace("{menu}", mainMenuText(session.name ?? "Learner"))
        .replace("{language}", languageLabel(language))
    };
  }

  if (session.state === "main_menu") {
    if (["1", "start", "module 1"].includes(normalized)) {
      session.state = "module_menu";
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: getRuntimeText(
          "bot.module.started",
          "Module 1 started. Reply NEXT for the next lesson or MENU to return."
        )
      };
    }
    if (["2", "progress"].includes(normalized)) {
      return {
        state: session.state,
        reply: getRuntimeText(
          "bot.progress.summary",
          `${session.name ?? "Learner"}, your current completion is 0%. Reply 1 to start Module 1.`
        ).replace("{name}", session.name ?? "Learner")
      };
    }
    if (["3", "language", "change language"].includes(normalized)) {
      session.state = "awaiting_language";
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: getRuntimeText(
          "bot.awaiting_language.prompt_short",
          "Choose language:\n1. English (EN)\n2. Pidgin (PCM)\n3. Igbo (IG)"
        )
      };
    }
    return {
      state: session.state,
      reply: getRuntimeText(
        "bot.main_menu.invalid",
        `I did not understand that.\n${mainMenuText(session.name ?? "Learner")}`
      ).replace("{menu}", mainMenuText(session.name ?? "Learner"))
    };
  }

  if (["menu", "0", "back"].includes(normalized)) {
    session.state = "main_menu";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: mainMenuText(session.name ?? "Learner")
    };
  }

  return {
    state: session.state,
    reply: getRuntimeText(
      "bot.module.lesson_tip",
      "Lesson 1: Keep daily sales records. Reply NEXT for the next tip or MENU to return."
    )
  };
}

export function handleWhatsAppWebhook(payload: unknown): WhatsAppWebhookResult {
  const inbound = extractInboundMessage(payload);
  if (!inbound) {
    return {
      status: "ignored",
      reason: getRuntimeText(
        "bot.webhook.ignored_reason",
        "No supported inbound text message in payload."
      )
    };
  }

  const existingSession = getOrCreateSession(inbound.from);
  if (processedMessageIds.has(inbound.id)) {
    return {
      status: "duplicate",
      phone: inbound.from,
      messageId: inbound.id,
      state: existingSession.state
    };
  }

  processedMessageIds.add(inbound.id);
  const result = transition(existingSession, inbound.text);
  sessions.set(inbound.from, existingSession);

  return {
    status: "processed",
    phone: inbound.from,
    messageId: inbound.id,
    state: result.state,
    reply: result.reply
  };
}

export function resetWhatsAppState() {
  sessions.clear();
  processedMessageIds.clear();
}

export function getWhatsAppSession(phone: string) {
  return sessions.get(phone);
}

