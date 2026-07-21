import { z } from "zod";
import { getRuntimeOptionSet, getRuntimeText, getRuntimeLocalizedText, getRuntimeLessons, getRuntimeRewardRules, RuntimeLesson, pickLocalized } from "../config-platform/runtime-config.js";
import { BOT_PROMPT_DEFAULTS, BOT_PROMPT_CONFIG_PREFIX } from "./bot-prompts.js";
import { prisma } from "../admin/prisma.js";
import type { WhatsAppListSpec } from "./sender.js";
import { sendWhatsAppMessage, BUTTON_TITLE_MAX, clip } from "./sender.js";
import { WHATSAPP_LIMITS } from "./constraints.js";

/**
 * Quiz answer buttons plus a MENU escape — but only append MENU when it fits
 * within WhatsApp's 3-button cap (GAP-C7). Appending unconditionally silently
 * dropped MENU whenever a question already had 3 options.
 */
function quizAnswerButtons(options: string[]): string[] {
  return options.length < WHATSAPP_LIMITS.maxButtons ? [...options, "MENU"] : options;
}

export type ConversationState = "awaiting_name" | "awaiting_language" | "awaiting_state" | "awaiting_custom_state" | "main_menu" | "module_menu" | "lesson_menu";

type AnalyticsEvent =
  | { type: "quiz_answered"; lessonKey: string; correct: boolean }
  | {
      type: "lesson_completed";
      lessonKey: string;
      module: string;
      completionPercentage: number;
    }
  | { type: "module_completed"; module: string }
  // GAP-C7: emitted when a lesson is opened, so drop-off before the quiz is
  // visible in analytics (previously invisible).
  | { type: "lesson_viewed"; lessonKey: string; module: string };

type UserSession = {
  phone: string;
  userId: string;
  name?: string;
  language?: "en" | "pcm" | "ig";
  location?: string;
  state: ConversationState;
  namePrompted?: boolean;
  lastUpdatedAt: string;
  completedLessons?: string[];
  currentLessonKey?: string | null;
  awaitingQuizAnswer?: boolean;
  currentQuizIndex?: number;
  selectedModuleId?: string | null;
  /**
   * Transient per-turn analytics events. Never persisted; cleared at the
   * start of each transition() and consumed by recordAnalytics() after
   * saveSession() runs.
   */
  _events?: AnalyticsEvent[];
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
      buttons?: string[];
      list?: WhatsAppListSpec;
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
                      .optional(),
                    interactive: z
                      .object({
                        type: z.enum(["button_reply", "list_reply"]),
                        button_reply: z
                          .object({
                            id: z.string(),
                            title: z.string()
                          })
                          .optional(),
                        list_reply: z
                          .object({
                            id: z.string(),
                            title: z.string()
                          })
                          .optional()
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

// Last-resort, same-replica dedup used ONLY when the Postgres dedup store is
// unreachable (GAP-C3 primary path is the DB table below). Bounded so it can
// never grow without limit.
const processedMessageIds = new Set<string>();
const PROCESSED_IDS_FALLBACK_CAP = 10000;

/**
 * Atomically claim an inbound message id so the same Meta delivery is processed
 * once across all Cloud Run replicas (GAP-C3). Returns true if this call won the
 * claim (proceed), false if it was already claimed (duplicate). Falls OPEN to a
 * bounded in-memory set if the DB is unreachable — at-least-once beats dropping
 * a learner's message.
 */
async function claimInboundMessage(messageId: string): Promise<boolean> {
  try {
    const inserted = await prisma.$executeRawUnsafe(
      `INSERT INTO processed_webhook_messages (message_id) VALUES ($1) ON CONFLICT (message_id) DO NOTHING`,
      messageId
    );
    // Opportunistic bounded cleanup: ~1% of claims prune rows older than 2 days.
    if (Math.random() < 0.01) {
      await prisma
        .$executeRawUnsafe(
          `DELETE FROM processed_webhook_messages WHERE created_at < now() - interval '2 days'`
        )
        .catch(() => {});
    }
    return inserted === 1;
  } catch {
    if (processedMessageIds.has(messageId)) return false;
    if (processedMessageIds.size >= PROCESSED_IDS_FALLBACK_CAP) processedMessageIds.clear();
    processedMessageIds.add(messageId);
    return true;
  }
}

/**
 * Release a previously claimed message id so Meta's retry can reprocess it
 * (GAP-C2). Called only when processing failed AFTER the claim but BEFORE the
 * session was durably saved.
 */
async function releaseInboundMessage(messageId: string): Promise<void> {
  await prisma
    .$executeRawUnsafe(`DELETE FROM processed_webhook_messages WHERE message_id = $1`, messageId)
    .catch(() => {});
  processedMessageIds.delete(messageId);
}

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

type StateRow = { id: string; title: string };

// Sentinel id for the fixed "Others" escape-hatch row. It is appended by the
// handler (never part of the admin-managed bot.state_options) so admins can't
// remove it and "Others" never becomes a stored location value — selecting it
// routes the learner to a free-text "type your state" step instead.
const OTHER_STATE_ID = "__other__";

function getStateRows(): StateRow[] {
  const configured = getRuntimeOptionSet("bot.state_options")
    .filter((item) => item.enabled)
    .map((item) => ({ id: item.value.trim().toLowerCase(), title: item.label.trim() }))
    .filter((r) => r.id.length > 0 && r.title.length > 0);
  if (configured.length > 0) return configured;
  // Resilience fallback so onboarding works before bot.state_options is seeded.
  return [
    { id: "anambra", title: "Anambra" },
    { id: "delta", title: "Delta" }
  ];
}

// The full list shown to the learner: the managed states plus the fixed
// "Others" row at the end.
function getDisplayStateRows(lang: "en" | "pcm" | "ig"): StateRow[] {
  return [...getStateRows(), { id: OTHER_STATE_ID, title: getPrompt("state_other_label", lang, "Others") }];
}

function resolveState(input: string, rows: StateRow[]): StateRow | null {
  const norm = input.trim().toLowerCase();
  // Always accept the literal "other"/"others" for the escape-hatch row,
  // regardless of how its label is localized.
  if (norm === "other" || norm === "others") {
    return rows.find((r) => r.id === OTHER_STATE_ID) ?? null;
  }
  const asNum = Number(norm);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= rows.length) {
    return rows[asNum - 1] ?? null;
  }
  // Match the canonical id (case-insensitive) or the display title. Id match
  // supports GAP-C4's id-first list replies regardless of slug casing.
  return (
    rows.find((r) => r.id.toLowerCase() === norm || r.title.trim().toLowerCase() === norm) ?? null
  );
}

function buildStateListReply(lang: "en" | "pcm" | "ig", rows: StateRow[]) {
  let reply = getPrompt("state_prompt", lang, "Which state are you in?") + "\n";
  rows.forEach((r, i) => {
    reply += `${i + 1}. ${r.title}\n`;
  });
  return {
    reply,
    list: {
      button: getPrompt("state_button", lang, "Choose state"),
      sections: [{ title: "States", rows: rows.map((r) => ({ id: r.id, title: r.title })) }]
    }
  };
}

function buildLessonListReply(
  moduleName: string,
  moduleLessons: RuntimeLesson[],
  completed: string[],
  lang: "en" | "pcm" | "ig"
): { reply: string; list: WhatsAppListSpec } {
  const shortModule = moduleName.split(":")[0] || moduleName;
  const header = getPrompt("lesson_menu_header", lang, "Choose a lesson to begin (✅ = done):");
  let reply = `📚 ${shortModule}\n${header}\n`;
  moduleLessons.forEach((l, i) => {
    const mark = completed.includes(l.key) ? "✅" : "▶️";
    const localizedTitle = pickLocalized(l.title, lang);
    const title = localizedTitle.length > 45 ? `${localizedTitle.slice(0, 44)}…` : localizedTitle;
    reply += `${i + 1}. ${mark} ${title}\n`;
  });
  reply += getPrompt("lesson_menu_footer", lang, "\nReply with a number, or tap “Choose lesson”. MENU to go back.");
  return {
    reply,
    list: {
      button: getPrompt("lesson_menu_button", lang, "Choose lesson"),
      sections: [
        {
          title: shortModule.slice(0, 24),
          // WhatsApp lists allow at most 10 rows; typers can still use the numbered body list.
          rows: moduleLessons.slice(0, 10).map((l, i) => ({
            id: l.key,
            title: `${completed.includes(l.key) ? "✅" : "▶️"} Lesson ${i + 1}`,
            description: pickLocalized(l.title, lang).slice(0, 72)
          }))
        }
      ]
    }
  };
}

function buildModuleListReply(
  moduleNames: string[],
  lang: "en" | "pcm" | "ig",
  headerKey: string,
  headerFallback: string
): { reply: string; list: WhatsAppListSpec } {
  const topicOf = (m: string) => (m.includes(":") ? m.split(":").slice(1).join(":").trim() : m);
  const shortOf = (m: string) => m.split(":")[0] || m;
  let reply = getPrompt(headerKey, lang, headerFallback);
  if (!reply.endsWith("\n")) reply += "\n";
  moduleNames.forEach((m, i) => {
    reply += `${i + 1}. ${topicOf(m)}\n`;
  });
  return {
    reply,
    list: {
      button: getPrompt("module_menu_button", lang, "Choose module"),
      sections: [
        {
          title: "Modules",
          rows: moduleNames.slice(0, 10).map((m, i) => ({
            id: `module-${i + 1}`,
            title: `${i + 1}. ${shortOf(m)}`.slice(0, 24),
            description: topicOf(m).slice(0, 72)
          }))
        }
      ]
    }
  };
}

function mainMenuText(name: string): string {
  let text = getRuntimeText("bot.main_menu", `Hello {name}! Main Menu:`);
  return text.replace("{name}", name);
}

function extractInboundMessage(payload: unknown): InboundMessage | null {
  const parsed = webhookPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const message = parsed.data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return null;

  let bodyText = "";
  if (message.interactive) {
    if (message.interactive.type === "button_reply") {
      bodyText = message.interactive.button_reply?.title || message.interactive.button_reply?.id || "";
    } else if (message.interactive.type === "list_reply") {
      // GAP-C4: prefer the row's canonical id over its display title. The id is
      // ASCII and stable (e.g. "module-3", a lesson key, a state slug), so a
      // tapped row resolves reliably even when the title is non-ASCII (e.g. the
      // Igbo "Others" label) or was truncated on the way to the device.
      bodyText = message.interactive.list_reply?.id || message.interactive.list_reply?.title || "";
    }
  } else {
    bodyText = message.text?.body || "";
  }

  return {
    id: message.id,
    from: message.from,
    text: bodyText.trim()
  };
}

async function getOrCreateSession(phone: string): Promise<UserSession> {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { session: true }
  });

  if (user && user.session) {
    const s: UserSession = {
      phone: user.phone,
      userId: user.id,
      state: user.session.state as ConversationState,
      lastUpdatedAt: user.session.lastUpdatedAt.toISOString(),
      completedLessons: user.session.completedLessons,
      currentLessonKey: user.session.currentLessonKey || null,
      awaitingQuizAnswer: user.session.awaitingQuizAnswer,
      currentQuizIndex: user.session.currentQuizIndex,
      selectedModuleId: user.session.selectedModuleId || null
    };
    if (user.name) s.name = user.name;
    if (user.language) s.language = user.language as any;
    if (user.location) s.location = user.location;
    if (user.session.namePrompted) s.namePrompted = user.session.namePrompted;
    return s;
  }

  if (user && !user.session) {
    const newSession = await prisma.userSession.create({
      data: {
        userId: user.id,
        state: "awaiting_name"
      }
    });
    const s: UserSession = {
      phone: user.phone,
      userId: user.id,
      state: newSession.state as ConversationState,
      lastUpdatedAt: newSession.lastUpdatedAt.toISOString(),
      completedLessons: []
    };
    if (user.name) s.name = user.name;
    if (user.language) s.language = user.language as any;
    if (user.location) s.location = user.location;
    return s;
  }

  const createdUser = await prisma.user.create({
    data: {
      phone,
      session: {
        create: {
          state: "awaiting_name"
        }
      }
    },
    include: { session: true }
  });

  const s2: UserSession = {
    phone: createdUser.phone,
    userId: createdUser.id,
    state: createdUser.session!.state as ConversationState,
    lastUpdatedAt: createdUser.session!.lastUpdatedAt.toISOString(),
    completedLessons: []
  };
  if (createdUser.name) s2.name = createdUser.name;
  if (createdUser.language) s2.language = createdUser.language as any;
  if (createdUser.location) s2.location = createdUser.location;
  return s2;
}

async function saveSession(phone: string, session: UserSession) {
  await prisma.user.update({
    where: { phone },
    data: {
      name: session.name || null,
      language: session.language || null,
      location: session.location || null,
      status: 'Active',
      session: {
        update: {
          state: session.state,
          namePrompted: session.namePrompted || false,
          completedLessons: session.completedLessons || [],
          currentLessonKey: session.currentLessonKey || null,
          awaitingQuizAnswer: session.awaitingQuizAnswer || false,
          currentQuizIndex: session.currentQuizIndex || 0,
          selectedModuleId: session.selectedModuleId || null,
          lastUpdatedAt: new Date()
        }
      }
    }
  });
}

function getPrompt(
  key: string,
  lang: "en" | "pcm" | "ig",
  fallback: string
): string {
  // Admin-editable: published copy in the config "content" namespace under
  // `bot.prompt.<key>` overrides the in-code default; the default is the safe
  // fallback when nothing is published, so the flow never breaks.
  const fallbackLocalized = BOT_PROMPT_DEFAULTS[key] ?? { en: fallback };
  const resolved = getRuntimeLocalizedText(`${BOT_PROMPT_CONFIG_PREFIX}${key}`, fallbackLocalized);
  return resolved[lang] ?? resolved.en ?? fallback;
}

/**
 * Resolve which option a learner's reply refers to, or -1 if none.
 *
 * Accepts either a numeric answer ("1"/"2"/"3", optionally prefixed like "1."
 * or "1)") or the option's text. Crucially it is tolerant of the truncation
 * WhatsApp applies to interactive reply-button titles (BUTTON_TITLE_MAX in
 * sender.ts): a tapped option longer than the limit is echoed back CLIPPED, so
 * each option is compared in both its full and clipped form. Without this,
 * options whose text exceeds the limit (e.g. M1 L7 Q3 "Set who sees your
 * info", 22 chars; M2 L6 Q1 "I need help migrating", 21 chars) can never be
 * identified on real WhatsApp even though they resolve fine in the dashboard
 * sandbox, which echoes the full untruncated title.
 *
 * A leading numeric reply ("2", "2.", "2)") is resolved by position first —
 * it always wins even if it happens to also collide with option text.
 *
 * Pure and exported so the matching rules can be unit-tested without the DB.
 */
export function resolveQuizOptionIndex(rawInput: string, options: string[]): number {
  const normalized = rawInput.trim().toLowerCase();
  // Strip a leading "N. " or "N) " prefix so button clicks like "1. Apple"
  // still match against the option text or the option number.
  const strippedInput = normalized.replace(/^\d+\s*[.)]\s*/, "").trim();

  const leadingNumberMatch = normalized.match(/^(\d+)\s*[.)]/);
  const numericCandidate = leadingNumberMatch ? (leadingNumberMatch[1] ?? "") : normalized;
  if (/^\d+$/.test(numericCandidate)) {
    const oneBased = Number(numericCandidate);
    if (oneBased >= 1 && oneBased <= options.length) {
      return oneBased - 1;
    }
  }

  const matchesOption = (opt: string): boolean => {
    const o = opt.trim().toLowerCase();
    const clipped = clip(o, BUTTON_TITLE_MAX);
    return normalized === o || strippedInput === o || normalized === clipped || strippedInput === clipped;
  };

  return options.findIndex(matchesOption);
}

/**
 * Decide whether a learner's quiz reply is correct.
 *
 * Delegates to resolveQuizOptionIndex() for the actual matching (numeric,
 * full-text, or clip-tolerant text) and compares the resolved index against
 * the answer key. See resolveQuizOptionIndex's doc comment for the WhatsApp
 * button-title truncation tolerance this preserves.
 *
 * The `selected >= 0` guard matters: resolveQuizOptionIndex returns -1 for an
 * unmatched reply, and a malformed answerIndex of -1 (e.g. bad config data)
 * must never equal that sentinel and score every unmatched reply "correct".
 *
 * Pure and exported so the matching rules can be unit-tested without the DB.
 */
export function isQuizReplyCorrect(rawInput: string, options: string[], answerIndex: number): boolean {
  const selected = resolveQuizOptionIndex(rawInput, options);
  return selected >= 0 && selected === answerIndex;
}

function transition(
  session: UserSession,
  text: string
): { state: ConversationState; reply: string; buttons?: string[]; list?: WhatsAppListSpec } {
  const safeText = text.trim();
  const normalized = safeText.toLowerCase();
  const lang = session.language || "en";

  // Ensure completed lessons list is always initialized
  session.completedLessons = session.completedLessons || [];

  // Fresh per-turn event buffer. recordAnalytics() drains this after the
  // session is persisted, so analytics writes can fail without breaking
  // the user-facing reply.
  session._events = [];

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
        `Thanks {name}. Choose your language:`
      ).replace("{name}", safeText),
      buttons: ["English", "Pidgin", "Igbo"]
    };
  }

  if (session.state === "awaiting_language") {
    const language = toLanguage(normalized);
    if (!language) {
      return {
        state: "awaiting_language",
        reply: getRuntimeText(
          "bot.awaiting_language.invalid",
          "Invalid language option. Please select your language:"
        ),
        buttons: ["English", "Pidgin", "Igbo"]
      };
    }

    session.language = language;
    session.state = "awaiting_state";
    session.lastUpdatedAt = nowIso();
    const stateRows = getDisplayStateRows(language);
    const stateList = buildStateListReply(language, stateRows);
    return {
      state: session.state,
      reply: stateList.reply,
      list: stateList.list
    };
  }

  if (session.state === "awaiting_state") {
    const rows = getDisplayStateRows(lang);
    const chosen = resolveState(normalized, rows);
    if (!chosen) {
      const list = buildStateListReply(lang, rows);
      return {
        state: "awaiting_state",
        // GAP-C5: localize the invalid-state re-prompt via editable config.
        reply:
          getPrompt("state_invalid", lang, "Please choose your state from the list.") +
          "\n" +
          list.reply,
        list: list.list
      };
    }
    if (chosen.id === OTHER_STATE_ID) {
      // Escape hatch: ask the learner to type their state instead of picking
      // from the managed list.
      session.state = "awaiting_custom_state";
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: getPrompt("custom_state_prompt", lang, "Please type the name of your state.")
      };
    }
    session.location = chosen.title;
    session.state = "main_menu";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: mainMenuText(session.name ?? "Learner"),
      buttons: ["1. Start Learning", "2. My Progress", "3. Change Language"]
    };
  }

  if (session.state === "awaiting_custom_state") {
    // Free-text state entry after the learner chose "Others". Preserve the
    // case the learner typed; require at least 2 non-space characters; cap at
    // 60 chars for storage.
    const custom = safeText.trim();
    if (custom.length < 2) {
      return {
        state: "awaiting_custom_state",
        reply: getPrompt("custom_state_prompt", lang, "Please type the name of your state.")
      };
    }
    session.location = custom.slice(0, 60);
    session.state = "main_menu";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: mainMenuText(session.name ?? "Learner"),
      buttons: ["1. Start Learning", "2. My Progress", "3. Change Language"]
    };
  }

  // Handle global MENU command to return to Main Menu from anywhere
  if (["menu", "0", "back"].includes(normalized)) {
    session.state = "main_menu";
    session.currentLessonKey = null;
    session.selectedModuleId = null;
    session.awaitingQuizAnswer = false;
    session.currentQuizIndex = 0;
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: mainMenuText(session.name ?? "Learner"),
      buttons: ["1. Start Learning", "2. My Progress", "3. Change Language"]
    };
  }

  // Load active dynamic lessons from config-platform database seeds
  const lessons = getRuntimeLessons();
  const modulesMap = new Map<string, RuntimeLesson[]>();
  for (const lesson of lessons) {
    const mName = lesson.module || "Module 1: Learning Path";
    if (!modulesMap.has(mName)) {
      modulesMap.set(mName, []);
    }
    modulesMap.get(mName)!.push(lesson);
  }
  // Order lessons within each module by their lesson number (…_l{N}_…) so the
  // menu numbering and the linear "next lesson" progression are stable and
  // match the curriculum order regardless of when each was last edited.
  const lessonNumber = (key: string) => parseInt((key.match(/_l(\d+)/) || [])[1] || "0", 10);
  for (const arr of modulesMap.values()) {
    arr.sort((a, b) => lessonNumber(a.key) - lessonNumber(b.key));
  }
  const moduleNames = Array.from(modulesMap.keys()).sort();

  if (session.state === "main_menu") {
    // Option 1: Start Learning / Modules Menu
    if (["1", "start", "module 1", "modules", "learn", "start learning", "1. start learning"].includes(normalized)) {
      session.state = "module_menu";
      session.selectedModuleId = null;
      session.currentLessonKey = null;
      session.awaitingQuizAnswer = false;
      session.lastUpdatedAt = nowIso();

      if (moduleNames.length === 0) {
        return {
          state: session.state,
          reply: "No learning modules are available at the moment. Reply MENU to return.",
          buttons: ["MENU"]
        };
      }

      const moduleMenu = buildModuleListReply(
        moduleNames,
        lang,
        "modules_menu_header",
        "Choose a Module to begin:"
      );
      return { state: session.state, reply: moduleMenu.reply, list: moduleMenu.list };
    }

    // Option 2: My Progress summary
    if (["2", "progress", "my progress", "2. my progress"].includes(normalized)) {
      // GAP-C5: use the real total lesson count (no `|| 6` magic) and guard
      // against divide-by-zero when no lessons are published.
      const totalCount = lessons.length;
      const completedCount = session.completedLessons.length;
      const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      const summaryText = lang === "pcm"
        ? `${session.name ?? "Learner"}, your current completion is ${percentage}%. You don finish ${completedCount} out of ${totalCount} lessons. Reply 1 to start learning or MENU to return.`
        : lang === "ig"
        ? `${session.name ?? "Learner"}, ngụkọta nkuzi gị mechara bụ ${percentage}%. I mechara ${completedCount} n'ime nkuzi ${totalCount}. Reply 1 ka ịmalite ma ọ bụ MENU ka ịlaghachi.`
        : `${session.name ?? "Learner"}, your current completion is ${percentage}%. You have completed ${completedCount} out of ${totalCount} lessons. Reply 1 to start learning or MENU to return.`;

      return {
        state: session.state,
        reply: getRuntimeText("bot.progress.summary", summaryText)
          .replace("{name}", session.name ?? "Learner")
          .replace("{percentage}", String(percentage))
          .replace("{completedCount}", String(completedCount))
          .replace("{totalCount}", String(totalCount)),
        buttons: ["1. Start Learning", "MENU"]
      };
    }

    // Option 3: Change Language
    if (["3", "language", "change language", "3. change language"].includes(normalized)) {
      session.state = "awaiting_language";
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: getRuntimeText(
          "bot.awaiting_language.prompt_short",
          "Choose your language:"
        ),
        buttons: ["English", "Pidgin", "Igbo"]
      };
    }

    return {
      state: session.state,
      reply: getRuntimeText(
        "bot.main_menu.invalid",
        `I did not understand that.\n${mainMenuText(session.name ?? "Learner")}`
      ).replace("{menu}", mainMenuText(session.name ?? "Learner")),
      buttons: ["1. Start Learning", "2. My Progress", "3. Change Language"]
    };
  }

  if (session.state === "lesson_menu") {
    const moduleLessons = session.selectedModuleId
      ? modulesMap.get(session.selectedModuleId) || []
      : [];

    if (moduleLessons.length === 0) {
      session.state = "module_menu";
      session.selectedModuleId = null;
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: "That module has no lessons yet. Reply MENU to return.",
        buttons: ["MENU"]
      };
    }

    // Resolve the chosen lesson. GAP-C4: a tapped row now arrives as its
    // canonical id (the lesson key); typed input arrives as "lesson N" / a
    // bare number.
    const byKey = moduleLessons.findIndex((l) => l.key.toLowerCase() === normalized);
    let lessonIdx: number;
    if (byKey >= 0) {
      lessonIdx = byKey + 1;
    } else {
      const lessonMatch = normalized.match(/lesson\s*(\d+)/) || normalized.match(/^(\d+)$/);
      lessonIdx = lessonMatch ? parseInt(lessonMatch[1]!, 10) : NaN;
    }
    if (!isNaN(lessonIdx) && lessonIdx >= 1 && lessonIdx <= moduleLessons.length) {
      const chosen = moduleLessons[lessonIdx - 1]!;
      session.currentLessonKey = chosen.key;
      session.state = "module_menu";
      session.awaitingQuizAnswer = false;
      session.currentQuizIndex = 0;
      session.lastUpdatedAt = nowIso();
      const lessonText = chosen.languages[lang] || chosen.languages.en || "";
      const reply = `📖 ${pickLocalized(chosen.title, lang)}\n\n${lessonText}${getPrompt("quiz_instruction", lang, "\n\nReply QUIZ to start the lesson quiz, or MENU to return.")}`;
      session._events!.push({
        type: "lesson_viewed",
        lessonKey: chosen.key,
        module: session.selectedModuleId ?? String(chosen.module ?? "")
      });
      return { state: session.state, reply, buttons: ["QUIZ", "MENU"] };
    }

    // Anything else → (re)show the lesson list for this module.
    const completed = session.completedLessons || [];
    const menu = buildLessonListReply(session.selectedModuleId || "", moduleLessons, completed, lang);
    return { state: session.state, reply: menu.reply, list: menu.list };
  }

  if (session.state === "module_menu") {
    // Case A: User has not selected a specific module yet (at the module list prompt)
    if (!session.selectedModuleId) {
      // GAP-C4: resolve the module from a tapped row id ("module-N"), a typed or
      // prefixed number ("2" / "2. Money…"), or a name fragment — not numeric-only.
      let num = NaN;
      const moduleIdMatch = normalized.match(/^module-(\d+)$/);
      const moduleNumMatch = normalized.match(/^(\d+)\b/);
      if (moduleIdMatch) {
        num = parseInt(moduleIdMatch[1]!, 10);
      } else if (moduleNumMatch) {
        num = parseInt(moduleNumMatch[1]!, 10);
      } else if (normalized.length >= 3) {
        const byName = moduleNames.findIndex((m) => m.toLowerCase().includes(normalized));
        if (byName >= 0) num = byName + 1;
      }
      if (!isNaN(num) && num >= 1 && num <= moduleNames.length) {
        const chosenModule = moduleNames[num - 1]!;
        session.selectedModuleId = chosenModule;
        session.lastUpdatedAt = nowIso();

        const moduleLessons = modulesMap.get(chosenModule) || [];
        if (moduleLessons.length === 0) {
          return {
            state: session.state,
            reply: `No lessons found in ${chosenModule}. Reply MENU to select another module.`,
            buttons: ["MENU"]
          };
        }

        // Show the lesson menu so the learner can pick any lesson in the module
        // (rather than jumping straight into their next unfinished lesson).
        session.state = "lesson_menu";
        session.currentLessonKey = null;
        session.awaitingQuizAnswer = false;
        session.currentQuizIndex = 0;

        const completed = session.completedLessons || [];
        const lessonMenu = buildLessonListReply(chosenModule, moduleLessons, completed, lang);
        return { state: session.state, reply: lessonMenu.reply, list: lessonMenu.list };
      }

      const moduleMenuInvalid = buildModuleListReply(
        moduleNames,
        lang,
        "invalid_module",
        "Invalid module selection. Please choose a Module to begin:"
      );
      return { state: session.state, reply: moduleMenuInvalid.reply, list: moduleMenuInvalid.list };
    }

    // Case B: User has an active selected module
    const moduleLessons = modulesMap.get(session.selectedModuleId) || [];
    const activeLesson = moduleLessons.find(l => l.key === session.currentLessonKey);

    if (!activeLesson) {
      // Safety reset if lesson key is invalid
      session.selectedModuleId = null;
      session.currentLessonKey = null;
      session.awaitingQuizAnswer = false;
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: "Selected lesson not found. Reply MENU to return.",
        buttons: ["MENU"]
      };
    }

    // Subcase B.1: Chatbot is awaiting answer for the active quiz
    if (session.awaitingQuizAnswer) {
      const qIndex = session.currentQuizIndex || 0;
      const quizItem = activeLesson.quiz[qIndex]; // Fetch active quiz item
      if (quizItem) {
        const correctIndex = quizItem.answerIndex;
        const options = quizItem.options.map((o) => pickLocalized(o, lang));
        const isCorrect = isQuizReplyCorrect(safeText, options, correctIndex);

        // Record every submitted answer so the admin Pass Rate / Quiz Pass
        // analytics reflect real bot interactions. quiz_attempts is keyed
        // on (userId, lessonKey) so retries accumulate against the same row.
        session._events!.push({
          type: "quiz_answered",
          lessonKey: activeLesson.key,
          correct: isCorrect
        });

        if (isCorrect) {
          // Success on this question
          const isLastQuestion = qIndex >= activeLesson.quiz.length - 1;

          if (!isLastQuestion) {
            // Move to next question immediately
            session.currentQuizIndex = qIndex + 1;
            session.lastUpdatedAt = nowIso();

            const nextQuizItem = activeLesson.quiz[qIndex + 1];
            if (!nextQuizItem) {
              // Defensive: should be unreachable because isLastQuestion guards
              // qIndex < quiz.length - 1, but noUncheckedIndexedAccess can't narrow
              // numeric comparisons. Fall back gracefully rather than emit a
              // half-formed reply.
              session.awaitingQuizAnswer = false;
              session.currentQuizIndex = 0;
              return {
                state: session.state,
                reply: "Quiz state issue. Reply MENU to return.",
                buttons: ["MENU"]
              };
            }
            const nextOptions = nextQuizItem.options.map((o) => pickLocalized(o, lang));
            let nextReply = `🎉 Correct!\n\n📚 Next Question:\n${pickLocalized(nextQuizItem.question, lang)}\n`;
            nextOptions.forEach((opt, idx) => {
              nextReply += `${idx + 1}. ${opt}\n`;
            });
            nextReply += getPrompt("quiz_answer_prompt", lang, "Reply with your answer (1, 2, or 3) or MENU to return.");

            return {
              state: session.state,
              reply: nextReply,
              buttons: quizAnswerButtons(nextOptions)
            };
          } else {
            // Success on entire quiz! Add to completed lessons
            if (!session.completedLessons.includes(activeLesson.key)) {
              session.completedLessons.push(activeLesson.key);
            }
            session.awaitingQuizAnswer = false;
            session.currentQuizIndex = 0;
            session.lastUpdatedAt = nowIso();

            // Record lesson completion so the admin Module Completion %
            // reflects real bot interactions. Compute the module's overall
            // completion percentage here where moduleLessons is in scope.
            const completedInModule = moduleLessons.filter((l) =>
              session.completedLessons!.includes(l.key)
            ).length;
            const completionPercentage =
              moduleLessons.length > 0
                ? Math.round((completedInModule / moduleLessons.length) * 100)
                : 0;
            session._events!.push({
              type: "lesson_completed",
              lessonKey: activeLesson.key,
              module: session.selectedModuleId ?? activeLesson.module ?? "Unknown",
              completionPercentage
            });

            // Find next lesson inside this module
            const currentIdx = moduleLessons.findIndex(l => l.key === activeLesson.key);
            const nextLesson = moduleLessons[currentIdx + 1];

            if (nextLesson) {
              session.currentLessonKey = nextLesson.key;
              
              // Build list of remaining lessons
              const remainingLessons = moduleLessons.slice(currentIdx + 1);
              let remainingText = "\n\nRemaining lessons in this module:\n";
              remainingLessons.forEach((l) => {
                remainingText += `- ${pickLocalized(l.title, lang)}\n`;
              });
              
              const replyBase = getPrompt("correct_next", lang, "🎉 Correct! Excellent job. You have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return.");
              
              return {
                state: session.state,
                reply: replyBase + remainingText,
                buttons: ["NEXT", "MENU"]
              };
            } else {
              // Completed entire module — capture the name before mutating
              // session state, then emit the analytics event so a reward
              // record can be inserted by recordAnalytics() after the user
              // turn is persisted.
              const completedModuleName =
                session.selectedModuleId ?? activeLesson.module ?? "Unknown";
              session._events!.push({
                type: "module_completed",
                module: completedModuleName
              });

              session.currentLessonKey = null;
              session.selectedModuleId = null;

              // Find other incomplete modules
              const incompleteModules = moduleNames.filter(m => {
                const lessons = modulesMap.get(m) || [];
                return !lessons.every(l => session.completedLessons!.includes(l.key));
              });

              let incompleteText = "";
              if (incompleteModules.length > 0) {
                incompleteText = "\n\nOther incomplete modules:\n";
                incompleteModules.forEach(m => {
                  incompleteText += `- ${m}\n`;
                });
              }

              const replyBase = getPrompt("correct_module_complete", lang, "🎉 Correct! Excellent job.\n\nCongratulations! You have completed all lessons in this module.\n\nReply MENU to choose another module.");

              return {
                state: session.state,
                reply: replyBase + incompleteText,
                buttons: ["MENU"]
              };
            }
          }
        } else {
          // Incorrect answer retry (reuse `options` resolved above for this lang)
          let reply = getPrompt("incorrect_retry", lang, "❌ That is incorrect. Let's try again!\n\n");
          reply += getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n");
          reply += `${pickLocalized(quizItem.question, lang)}\n`;
          options.forEach((opt, idx) => {
            reply += `${idx + 1}. ${opt}\n`;
          });
          reply += getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3) or MENU to return.");

          return {
            state: session.state,
            reply,
            buttons: quizAnswerButtons(options)
          };
        }
      } else {
        // GAP-C1: awaitingQuizAnswer is true but the quiz item at this index is
        // missing (empty quiz or a corrupted index). Without this the learner is
        // trapped — every reply falls through to "did not understand" until they
        // happen to type MENU. Reset the quiz flags and give a clear way out.
        session.awaitingQuizAnswer = false;
        session.currentQuizIndex = 0;
        session.lastUpdatedAt = nowIso();
        return {
          state: session.state,
          reply: getPrompt(
            "quiz_unavailable",
            lang,
            "This lesson's quiz isn't available right now. Reply NEXT to continue or MENU to return."
          ),
          buttons: ["NEXT", "MENU"]
        };
      }
    }

    // Subcase B.2: Chatbot is in lesson view (awaiting next or quiz trigger)
    if (["quiz", "start quiz", "take quiz", "test"].includes(normalized) || (session.awaitingQuizAnswer && ["next", "continue"].includes(normalized))) {
      const qIndex = session.currentQuizIndex || 0;
      const quizItem = activeLesson.quiz[qIndex];
      
      if (!quizItem) {
        return {
          state: session.state,
          reply: "No quiz questions found for this lesson. Reply NEXT to proceed or MENU to return.",
          buttons: ["NEXT", "MENU"]
        };
      }

      session.awaitingQuizAnswer = true;
      session.lastUpdatedAt = nowIso();

      const options = quizItem.options.map((o) => pickLocalized(o, lang));
      let reply = getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n");
      reply += `${pickLocalized(quizItem.question, lang)}\n`;
      options.forEach((opt, idx) => {
        reply += `${idx + 1}. ${opt}\n`;
      });
      reply += getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3) or MENU to return.");

      return {
        state: session.state,
        reply,
        buttons: quizAnswerButtons(options)
      };
    }

    if (["next", "continue"].includes(normalized) && !session.awaitingQuizAnswer) {
      const lessonText = activeLesson.languages[lang] || activeLesson.languages.en || "";
      const reply = `📖 ${pickLocalized(activeLesson.title, lang)}\n\n${lessonText}${getPrompt("quiz_instruction", lang, "\n\nReply QUIZ to start the lesson quiz, or MENU to return.")}`;
      session.lastUpdatedAt = nowIso();
      session._events!.push({
        type: "lesson_viewed",
        lessonKey: activeLesson.key,
        module: session.selectedModuleId ?? String(activeLesson.module ?? "")
      });
      return {
        state: session.state,
        reply,
        buttons: ["QUIZ", "MENU"]
      };
    }

    // Fallback did-not-understand message in lesson view
    return {
      state: session.state,
      reply: getPrompt("bot_did_not_understand", lang, "I did not understand that. Reply QUIZ to start this lesson's quiz, NEXT to progress, or MENU to return."),
      buttons: ["QUIZ", "NEXT", "MENU"]
    };
  }

  return {
    state: session.state,
    reply: getPrompt("bot_did_not_understand", lang, "I did not understand that. Reply MENU to return to the main menu."),
    buttons: ["MENU"]
  };
}

/**
 * Drain the transient `_events` buffer set by transition() and persist
 * the corresponding rows in quiz_attempts / user_progress. Failures here
 * MUST NOT bubble up — the user already got their reply from transition,
 * and analytics drift is far less important than a 500 in the webhook.
 */
async function recordAnalytics(session: UserSession): Promise<void> {
  const events = session._events ?? [];
  if (events.length === 0) {
    return;
  }
  for (const event of events) {
    try {
      if (event.type === "lesson_viewed") {
        // GAP-C7: structured analytics line for lesson opens (drop-off before
        // the quiz). Picked up by a Cloud Logging log-based metric; no schema
        // change required.
        console.log(
          JSON.stringify({
            event: "analytics.lesson_viewed",
            userId: session.userId,
            lessonKey: event.lessonKey,
            module: event.module,
            at: nowIso()
          })
        );
      } else if (event.type === "quiz_answered") {
        await prisma.quizAttempt.upsert({
          where: {
            userId_lessonKey: {
              userId: session.userId,
              lessonKey: event.lessonKey
            }
          },
          update: {
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date()
          },
          create: {
            userId: session.userId,
            lessonKey: event.lessonKey,
            attemptCount: 1,
            passed: false,
            lastAttemptAt: new Date()
          }
        });
      } else if (event.type === "lesson_completed") {
        // Mark the quiz attempt as passed (lesson is only marked complete
        // when the final question of its quiz is answered correctly).
        await prisma.quizAttempt.upsert({
          where: {
            userId_lessonKey: {
              userId: session.userId,
              lessonKey: event.lessonKey
            }
          },
          update: { passed: true },
          create: {
            userId: session.userId,
            lessonKey: event.lessonKey,
            attemptCount: 1,
            passed: true,
            lastAttemptAt: new Date()
          }
        });
        // Update the per-module completion percentage for the analytics
        // dashboard. Module column is the module name string.
        await prisma.userProgress.upsert({
          where: {
            userId_module: {
              userId: session.userId,
              module: event.module
            }
          },
          update: {
            completionPercentage: event.completionPercentage,
            updatedAt: new Date()
          },
          create: {
            userId: session.userId,
            module: event.module,
            completionPercentage: event.completionPercentage
          }
        });
      } else if (event.type === "module_completed") {
        const rule = getRuntimeRewardRules();
        if (rule && rule.enabled === false) {
          // Rewards disabled by the admin reward rule — skip creating a reward.
          continue;
        }
        const envAmount = Number(process.env.REWARD_DEFAULT_AMOUNT);
        const fallbackAmount = Number.isFinite(envAmount) && envAmount > 0 ? envAmount : 500;
        const amount = rule?.amount ?? fallbackAmount;
        const channel = rule?.channel ?? ((process.env.REWARD_DEFAULT_CHANNEL ?? "airtime").trim() || "airtime");
        // Guard against an empty or whitespace-only module name, which would
        // otherwise collapse the (userId, module) dedup key for the user.
        const moduleKey = (event.module ?? "").trim() || "Unknown";
        await prisma.reward.upsert({
          where: {
            userId_module: { userId: session.userId, module: moduleKey }
          },
          update: {},  // never overwrite an existing reward when the user replays a module
          create: {
            userId: session.userId,
            module: moduleKey,
            amount,
            channel,
            status: "Pending",
            learnerPhone: session.phone
          }
        });
      }
    } catch (error) {
      console.warn(
        "recordAnalytics: failed to persist event",
        event.type,
        error instanceof Error ? error.message : error
      );
    }
  }
}

export async function handleWhatsAppWebhook(
  payload: unknown,
  opts: { deliver?: boolean } = {}
): Promise<WhatsAppWebhookResult> {
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

  const existingSession = await getOrCreateSession(inbound.from);

  // GAP-C3: claim the message in Postgres so duplicate Meta deliveries dedup
  // across replicas. GAP-C2: if anything below throws before the session is
  // saved, we RELEASE the claim so Meta's retry reprocesses instead of being
  // dropped as a duplicate and silently losing the learner's progress.
  const claimed = await claimInboundMessage(inbound.id);
  if (!claimed) {
    return {
      status: "duplicate",
      phone: inbound.from,
      messageId: inbound.id,
      state: existingSession.state
    };
  }

  let result: ReturnType<typeof transition>;
  try {
    result = transition(existingSession, inbound.text);
    await saveSession(inbound.from, existingSession);
  } catch (error) {
    await releaseInboundMessage(inbound.id);
    throw error;
  }

  // Session is durably saved past this point — analytics/delivery failures must
  // not release the claim (that would re-run the transition and double-advance).
  await recordAnalytics(existingSession);

  if (opts.deliver) {
    await sendWhatsAppMessage(inbound.from, {
      text: result.reply,
      ...(result.buttons ? { buttons: result.buttons } : {}),
      ...(result.list ? { list: result.list } : {})
    });
  }

  return {
    status: "processed",
    phone: inbound.from,
    messageId: inbound.id,
    state: result.state,
    reply: result.reply,
    ...(result.buttons ? { buttons: result.buttons } : {}),
    ...(result.list ? { list: result.list } : {})
  };
}

export async function resetWhatsAppState() {
  await prisma.userSession.deleteMany({});
  processedMessageIds.clear();
  await prisma
    .$executeRawUnsafe(`DELETE FROM processed_webhook_messages`)
    .catch(() => {});
}

export async function getWhatsAppSession(phone: string) {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { session: true }
  });
  if (!user || !user.session) return null;

  return {
    phone: user.phone,
    name: user.name || undefined,
    language: (user.language as any) || undefined,
    location: user.location || undefined,
    state: user.session.state as ConversationState,
    namePrompted: user.session.namePrompted,
    lastUpdatedAt: user.session.lastUpdatedAt.toISOString(),
    completedLessons: user.session.completedLessons,
    currentLessonKey: user.session.currentLessonKey,
    awaitingQuizAnswer: user.session.awaitingQuizAnswer,
    currentQuizIndex: user.session.currentQuizIndex,
    selectedModuleId: user.session.selectedModuleId
  };
}

