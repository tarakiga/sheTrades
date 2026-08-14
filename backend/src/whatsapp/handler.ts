import { z } from "zod";
import { getRuntimeOptionSet, getRuntimeText, getRuntimeBranding, getRuntimeLocalizedText, getRuntimeLessons, getRuntimeRewardRules, RuntimeLesson, pickLocalized } from "../config-platform/runtime-config.js";
import { countCompletedModules, resolveMilestoneAwards } from "../rewards/milestones.js";
import { sendHelpRequestEmail } from "../notifications/help-request-email.js";
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
  | { type: "lesson_viewed"; lessonKey: string; module: string }
  // A learner explicitly asked for help on a reflection question. This is the
  // highest-value signal the bot produces — previously it was scored as a
  // wrong answer and discarded.
  | {
      type: "help_requested";
      lessonKey: string;
      module: string;
      questionIndex: number;
      // Carried on the event rather than re-read in recordAnalytics: the
      // lesson, question and chosen option are all in scope at push time, and
      // the notification email is useless without them.
      lessonTitle: string;
      questionText: string;
      optionChosen: string;
    };

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
  // R3-F8: consecutive wrong attempts on the current question (drives the hint).
  quizRetryCount?: number;
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

// Prefix for the "More states" pagination rows: WhatsApp lists carry at most
// 10 rows total, and Nigeria has 37 states/FCT, so the full list pages 9 at a
// time with a tenth row that requests the next page.
const STATES_PAGE_ID_PREFIX = "__states_page_";
const STATES_PER_PAGE = 9;

export function statesPageId(page: number): string {
  return `${STATES_PAGE_ID_PREFIX}${page}__`;
}

export function parseStatesPageId(input: string): number | null {
  const match = input.trim().match(/^__states_page_(\d+)__$/);
  return match ? Number(match[1]) : null;
}

/**
 * Every Nigerian state (+ FCT), shown page by page after the learner taps
 * "Others" - so nobody has to type their state by hand. Admin-managed via the
 * bot.states_full option set; the complete built-in list is the resilience
 * fallback (safe defaults) since the set of states is stable.
 */
const ALL_NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT (Abuja)"
];

export function getFullStateRows(): StateRow[] {
  const configured = getRuntimeOptionSet("bot.states_full")
    .filter((item) => item.enabled)
    .map((item) => ({ id: item.value.trim().toLowerCase(), title: item.label.trim() }))
    .filter((r) => r.id.length > 0 && r.title.length > 0);
  if (configured.length > 0) return configured;
  return ALL_NIGERIAN_STATES.map((title) => ({
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    title
  }));
}

export function buildStatesPageReply(lang: "en" | "pcm" | "ig", page: number) {
  const all = getFullStateRows();
  const totalPages = Math.max(Math.ceil(all.length / STATES_PER_PAGE), 1);
  const clamped = Math.min(Math.max(page, 1), totalPages);
  const slice = all.slice((clamped - 1) * STATES_PER_PAGE, clamped * STATES_PER_PAGE);
  const rows: StateRow[] = [...slice];
  if (clamped < totalPages) {
    rows.push({
      id: statesPageId(clamped + 1),
      title: getPrompt("state_more_label", lang, "More states ➡️")
    });
  }
  return {
    reply: `${getPrompt("state_prompt", lang, "Which state are you in?")} (${clamped}/${totalPages})`,
    list: {
      button: getPrompt("state_button", lang, "Choose state"),
      sections: [{ title: "States", rows: rows.map((r) => ({ id: r.id, title: r.title })) }]
    }
  };
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

export function extractInboundMessage(payload: unknown): InboundMessage | null {
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
      quizRetryCount: user.session.quizRetryCount ?? 0,
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
          quizRetryCount: session.quizRetryCount ?? 0,
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
 * An unambiguous exact (full-text) match always wins over a clipped-form
 * match, even one on an earlier option: e.g. options ["Save money every day
 * for rent", "Save money every day", "Not sure"], input "Save money every
 * day" is a full match for index 1 but ALSO a clipped-prefix match for index
 * 0 ("Save money every day for rent".slice(0, 20) === "Save money every day"
 * plus one more char that trim/clip still collapses) — the full match must
 * win, because it is unambiguous and the clipped one is a coincidence.
 * Clipped comparison is only consulted once nothing matches in full.
 *
 * A leading numeric reply ("2", "2.", "2)") is resolved by position first —
 * it always wins even if it happens to also collide with option text.
 *
 * Pure and exported so the matching rules can be unit-tested without the DB.
 */
export function resolveQuizOptionIndex(rawInput: string, options: string[]): number {
  const normalized = rawInput.trim().toLowerCase();
  if (!normalized) return -1;

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

  const norm = (o: string) => o.trim().toLowerCase();

  // An unambiguous exact match always wins before we ever consider clipped
  // forms — see doc comment above for why this ordering matters.
  const exact = options.findIndex((o) => normalized === norm(o) || strippedInput === norm(o));
  if (exact >= 0) return exact;

  // Fall back to clipped comparison only when nothing matched in full. A
  // tapped option longer than BUTTON_TITLE_MAX is echoed truncated, so the
  // clipped form is all we have — but it can prefix-collide with a shorter
  // sibling option, so an unambiguous full match must always take precedence.
  // .trim() on the clipped form is load-bearing: when an option's 20th char
  // is a space (e.g. "Small fixed amounts |often"), the title we SEND ends in
  // that space but `normalized` above is trimmed - so without trimming both
  // sides the tapped correct answer can never match and grades incorrect.
  // Four Round-4 UX-report questions hit exactly this.
  const clippedMatch = options.findIndex((o) => {
    const clipped = clip(norm(o), BUTTON_TITLE_MAX).trim();
    return normalized === clipped || strippedInput === clipped;
  });

  // Two options whose clipped forms collide with each other are genuinely
  // unresolvable from a clipped title alone; findIndex silently picks the
  // first. That's a content-authoring bug (options too similar in their
  // first BUTTON_TITLE_MAX chars) which is currently invisible in
  // production, so surface it rather than let it hide — especially now
  // that options are localized (pickLocalized) and the English-only length
  // audit in docs/content-quiz-option-length-fixes.csv doesn't cover pcm/ig.
  const matchedOption = clippedMatch >= 0 ? options[clippedMatch] : undefined;
  if (clippedMatch >= 0 && matchedOption !== undefined) {
    const matchedClipped = clip(norm(matchedOption), BUTTON_TITLE_MAX).trim();
    const collidingIndex = options.findIndex(
      (o, i) => i > clippedMatch && clip(norm(o), BUTTON_TITLE_MAX).trim() === matchedClipped
    );
    if (collidingIndex >= 0) {
      console.warn(JSON.stringify({
        event: "whatsapp.quiz.option_clip_collision",
        matchedIndex: clippedMatch,
        collidingIndex,
        clippedForm: matchedClipped
      }));
    }
  }

  return clippedMatch;
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
 * Note on dropped leniency: the pre-extraction version OR'd a numeric match
 * and a text match, so e.g. "1. Not yet" (where "Not yet" is really option
 * index 2) used to score correct for EITHER answerIndex 0 or 2. This version
 * resolves to a single index and the numeric form wins outright when
 * present, so it now only scores correct for index 0. That's intentional,
 * not a regression to fix later — sender.ts numbers reply buttons strictly
 * by position, so position is the authoritative signal and text is only a
 * fallback for freeform typed replies.
 *
 * Pure and exported so the matching rules can be unit-tested without the DB.
 */
export function isQuizReplyCorrect(rawInput: string, options: string[], answerIndex: number): boolean {
  const selected = resolveQuizOptionIndex(rawInput, options);
  return selected >= 0 && selected === answerIndex;
}

/**
 * What to do with a learner's reply to a reflection question.
 *
 * There is deliberately no "incorrect" outcome: a reflection question asks what
 * the learner DID, so every recognised option is a valid answer. Only an
 * unrecognised reply re-asks, and even then it must never be treated as a
 * failed attempt — see the re-ask branch in transition().
 */
export type ReflectionOutcome =
  | { action: "reask" }
  // selectedIndex is carried so callers can name the option the learner chose
  // (the help-request notification quotes it back to the support team).
  | { action: "advance"; helpRequested: boolean; selectedIndex: number };

/**
 * Decide the outcome of a reflection reply.
 *
 * Delegates matching to resolveQuizOptionIndex(), so it inherits the numeric,
 * full-text and clipped-button-title tolerance documented there — the clipped
 * case matters here specifically because "I need help migrating" (21 chars)
 * exceeds BUTTON_TITLE_MAX and comes back truncated from real WhatsApp.
 *
 * Pure and exported so the decision rules can be unit-tested without the DB.
 */
export function resolveReflectionAnswer(
  rawInput: string,
  options: string[],
  helpOptionIndex?: number
): ReflectionOutcome {
  const selected = resolveQuizOptionIndex(rawInput, options);
  if (selected < 0) return { action: "reask" };
  return {
    action: "advance",
    helpRequested: helpOptionIndex !== undefined && selected === helpOptionIndex,
    selectedIndex: selected
  };
}

/**
 * Build the merged `followUpNote` value for a help_requested event, appending
 * to any existing note rather than overwriting it — a learner may ask for
 * help on several lessons, and an operator reading /users needs the history.
 *
 * Pure and exported so the append-vs-overwrite behaviour can be unit-tested
 * without a database; recordAnalytics() itself requires one (the read/update
 * of the User row), so this is the only part of that logic that can be
 * isolated.
 */
export function composeHelpRequestNote(
  existingNote: string | null | undefined,
  event: { lessonKey: string; lessonTitle?: string; module: string; questionIndex: number },
  stamp: string
): string {
  // Prefer the lesson TITLE over the key. This note renders verbatim in the
  // admin /users drawer and the Overview panel, so "content.lesson.m2_l6_m"
  // leaks an internal identifier into a surface non-technical operators read.
  // The key stays as the fallback for events recorded before lessonTitle existed.
  const lessonLabel = event.lessonTitle?.trim() || event.lessonKey;
  const note = `[${stamp}] Asked for help: ${lessonLabel} (${event.module}, Q${event.questionIndex + 1})`;
  return existingNote ? `${existingNote}\n${note}` : note;
}

/**
 * Which copy set `advanceAfterAcceptedAnswer` uses for its success messages.
 *
 * The advance LOGIC is shared between the scored and reflection paths so the
 * two can never drift, but the WORDING must not be: a reflection answer is
 * accepted, not correct. Telling a learner who answered "Not yet" that they
 * were "🎉 Correct!" recreates the pressure to misreport that scoring these
 * questions caused in the first place.
 *
 * Every entry is a `getPrompt` key so all of this copy stays admin-editable.
 */
type AdvanceCopy = {
  /** Headline above the next question. */
  headline: { key: string; fallback: string };
  /** Whole reply when the lesson is finished and another follows. */
  nextLesson: { key: string; fallback: string };
  /** Whole reply when the final lesson of the module is finished. */
  moduleComplete: { key: string; fallback: string };
};

/** Copy for a correct scored answer. Preserves the pre-existing wording. */
const SCORED_ADVANCE_COPY: AdvanceCopy = {
  headline: { key: "correct_headline", fallback: "🎉 Correct!" },
  nextLesson: {
    key: "correct_next",
    fallback:
      "🎉 Correct! Excellent job. You have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return."
  },
  moduleComplete: {
    key: "correct_module_complete",
    fallback:
      "🎉 Correct! Excellent job.\n\nCongratulations! You have completed all lessons in this module.\n\nChoose your next module below."
  }
};

/** Copy for an accepted reflection answer: acknowledges, never affirms. */
const REFLECTION_ADVANCE_COPY: AdvanceCopy = {
  headline: { key: "reflection_headline", fallback: "✅ Thanks for sharing." },
  nextLesson: {
    key: "reflection_next",
    fallback:
      "✅ Thanks for sharing.\n\nYou have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return."
  },
  moduleComplete: {
    key: "reflection_module_complete",
    fallback:
      "✅ Thanks for sharing.\n\nYou have completed all lessons in this module.\n\nChoose your next module below."
  }
};

/**
 * Advance past an accepted answer: next question, next lesson, or module
 * complete. Shared by the scored-correct path and the reflection path so the
 * two can never drift — a reflection answer must produce the same completion,
 * reward and analytics side effects as a correct scored answer.
 *
 * `prefix` is prepended to whatever reply is produced (used for the help
 * acknowledgement). `copy` selects the wording — see AdvanceCopy: the side
 * effects are shared, the affirmation is not.
 */
export function advanceAfterAcceptedAnswer(
  session: UserSession,
  activeLesson: RuntimeLesson,
  moduleLessons: RuntimeLesson[],
  moduleNames: string[],
  modulesMap: Map<string, RuntimeLesson[]>,
  qIndex: number,
  lang: "en" | "pcm" | "ig",
  prefix = "",
  copy: AdvanceCopy = SCORED_ADVANCE_COPY
): { state: ConversationState; reply: string; buttons?: string[]; list?: WhatsAppListSpec } {
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
        reply: prefix + "Quiz state issue. Reply MENU to return.",
        buttons: ["MENU"]
      };
    }
    const nextOptions = nextQuizItem.options.map((o) => pickLocalized(o, lang));
    const headline = getPrompt(copy.headline.key, lang, copy.headline.fallback);
    let nextReply = `${headline}\n\n📚 Next Question:\n${pickLocalized(nextQuizItem.question, lang)}\n`;
    nextOptions.forEach((opt, idx) => {
      nextReply += `${idx + 1}. ${opt}\n`;
    });
    nextReply += getPrompt("quiz_answer_prompt", lang, "Reply with your answer (1, 2, or 3), or type MENU to return.");

    return {
      state: session.state,
      reply: prefix + nextReply,
      buttons: quizAnswerButtons(nextOptions)
    };
  } else {
    // Success on entire quiz! Add to completed lessons
    if (!session.completedLessons!.includes(activeLesson.key)) {
      session.completedLessons!.push(activeLesson.key);
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

      const replyBase = getPrompt(copy.nextLesson.key, lang, copy.nextLesson.fallback);

      return {
        state: session.state,
        reply: prefix + replyBase + remainingText,
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

      // UX Round 3 O-2: this used to say "Reply MENU to choose another module"
      // while MENU routed to the top-level main menu — the promised picker
      // never appeared. Serve the module picker ON the completion message
      // instead: the session lands in module_menu so every module row (and a
      // typed number) works immediately, with no extra hop through the main
      // menu — which also saves one billable message per module transition.
      if (incompleteModules.length > 0) {
        session.state = "module_menu";
        const replyBase = getPrompt(copy.moduleComplete.key, lang, copy.moduleComplete.fallback);
        const moduleMenu = buildModuleListReply(
          moduleNames,
          lang,
          "modules_menu_header",
          "Choose a Module to begin:"
        );
        return {
          state: session.state,
          reply: prefix + replyBase + "\n\n" + moduleMenu.reply,
          list: moduleMenu.list
        };
      }

      // Nothing left to pick — the whole programme is complete.
      return {
        state: session.state,
        reply:
          prefix +
          getPrompt(
            "programme_complete",
            lang,
            "🎓 Amazing! You have completed every module in the programme. Reply MENU to return to the main menu."
          ),
        buttons: ["MENU"]
      };
    }
  }
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
          `Welcome to ${getRuntimeBranding().organisationName}. Please reply with your full name to begin.`
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
    // A tapped "More states" pagination row: serve the requested page and stay
    // in the same step.
    const requestedPage = parseStatesPageId(normalized);
    if (requestedPage !== null) {
      const pageList = buildStatesPageReply(lang, requestedPage);
      return { state: "awaiting_state", reply: pageList.reply, list: pageList.list };
    }

    // Resolve against the short managed list AND the full list, so a tap from
    // any full-list page (or a typed full state name) lands. Note: typed
    // NUMBERS only address the short list - full-list pages are id/title
    // matched, which is what list taps send.
    const rows = getDisplayStateRows(lang);
    const chosen = resolveState(normalized, rows) ?? resolveState(normalized, getFullStateRows());
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
      // "Others" now opens the FULL paginated state list instead of asking the
      // learner to type - nobody enters their state by hand. (The typed-entry
      // awaiting_custom_state step below remains for in-flight sessions.)
      const pageList = buildStatesPageReply(lang, 1);
      return { state: "awaiting_state", reply: pageList.reply, list: pageList.list };
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

      // R3-F10b (product call: per-module + overall): a learner who finishes a
      // full lesson should see progress that feels like movement ("Module 3:
      // 4/9 - 44%"), not "1 of 43 - 2%". One line per STARTED module.
      const moduleLines: string[] = [];
      const completedKeys = session.completedLessons ?? [];
      for (const [moduleName, moduleLessons] of modulesMap) {
        const done = moduleLessons.filter((l) => completedKeys.includes(l.key)).length;
        if (done > 0) {
          const shortName = moduleName.split(":")[0] || moduleName;
          const modulePct = Math.round((done / moduleLessons.length) * 100);
          moduleLines.push(`• ${shortName}: ${done}/${moduleLessons.length} (${modulePct}%)`);
        }
      }
      const breakdown = moduleLines.length > 0 ? moduleLines.join("\n") : "";

      let progressReply = getRuntimeText("bot.progress.summary", summaryText)
        .replace("{name}", session.name ?? "Learner")
        .replace("{percentage}", String(percentage))
        .replace("{completedCount}", String(completedCount))
        .replace("{totalCount}", String(totalCount));
      // Published templates may place {moduleBreakdown} wherever they like;
      // templates that predate the token get the breakdown appended so the
      // improvement lands without a republish.
      if (progressReply.includes("{moduleBreakdown}")) {
        progressReply = progressReply.replace("{moduleBreakdown}", breakdown);
      } else if (breakdown) {
        progressReply += `\n\n${breakdown}`;
      }

      return {
        state: session.state,
        reply: progressReply,
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
        // Reflection questions have no right answer — they ask what the learner
        // DID, not what they know. Scoring them traps anyone who honestly
        // answers "Not yet" and pressures them into a false "Yes" to progress,
        // which is also the only path to a reward payout.
        if (quizItem.kind === "reflection") {
          const reflectionOptions = quizItem.options.map((o) => pickLocalized(o, lang));
          const outcome = resolveReflectionAnswer(
            safeText,
            reflectionOptions,
            quizItem.helpOptionIndex
          );

          if (outcome.action === "reask") {
            // Unrecognised free text: re-ask without any "incorrect" framing.
            //
            // DO NOT add a retry counter or attempt limit to this branch. There
            // is no lesson re-read command in the bot, so any limit has to fall
            // through to something — and every such "something" reintroduces the
            // trap this whole change exists to remove. Re-asking indefinitely is
            // safe precisely because MENU is handled globally above and always
            // escapes.
            return {
              state: session.state,
              reply:
                getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n") +
                `${pickLocalized(quizItem.question, lang)}\n` +
                reflectionOptions.map((opt, idx) => `${idx + 1}. ${opt}\n`).join("") +
                getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3), or type MENU to return."),
              buttons: quizAnswerButtons(reflectionOptions)
            };
          }

          if (outcome.helpRequested) {
            session._events!.push({
              type: "help_requested",
              lessonKey: activeLesson.key,
              module: session.selectedModuleId ?? activeLesson.module ?? "Unknown",
              questionIndex: qIndex,
              lessonTitle: pickLocalized(activeLesson.title, lang) || activeLesson.key,
              questionText: pickLocalized(quizItem.question, lang),
              optionChosen: reflectionOptions[outcome.selectedIndex] ?? ""
            });
          }

          const ackPrefix = outcome.helpRequested
            ? getPrompt(
                "quiz_help_ack",
                lang,
                "No problem — thank you for telling us. We have noted that you need help with this one, and the team will follow up.\n\n"
              )
            : "";

          return advanceAfterAcceptedAnswer(
            session, activeLesson, moduleLessons, moduleNames, modulesMap, qIndex, lang,
            ackPrefix, REFLECTION_ADVANCE_COPY
          );
        }

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
          session.quizRetryCount = 0;
          return advanceAfterAcceptedAnswer(
            session, activeLesson, moduleLessons, moduleNames, modulesMap, qIndex, lang
          );
        } else {
          // R3-F8: count consecutive misses so the second try gets a nudge
          // instead of a verbatim replay. The numbered option list stays - it
          // is the full-text reference for options the 20-char buttons clip.
          session.quizRetryCount = (session.quizRetryCount ?? 0) + 1;
          let reply = getPrompt("incorrect_retry", lang, "❌ That is incorrect. Let's try again!\n\n");
          if ((session.quizRetryCount ?? 0) >= 2) {
            reply += getPrompt(
              "quiz_retry_hint",
              lang,
              "💡 Hint: the answer is in the lesson text above - scroll up and check before you answer.\n\n"
            );
          }
          reply += getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n");
          reply += `${pickLocalized(quizItem.question, lang)}\n`;
          options.forEach((opt, idx) => {
            reply += `${idx + 1}. ${opt}\n`;
          });
          reply += getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3), or type MENU to return.");

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
      session.quizRetryCount = 0;
      session.lastUpdatedAt = nowIso();

      const options = quizItem.options.map((o) => pickLocalized(o, lang));
      let reply = getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n");
      reply += `${pickLocalized(quizItem.question, lang)}\n`;
      options.forEach((opt, idx) => {
        reply += `${idx + 1}. ${opt}\n`;
      });
      reply += getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3), or type MENU to return.");

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
        const channel = rule?.channel ?? ((process.env.REWARD_DEFAULT_CHANNEL ?? "airtime").trim() || "airtime");

        if (rule?.milestones && rule.milestones.length > 0) {
          // Client incentive plan (2026-08): milestone payouts replace
          // per-module payouts. Count fully-completed modules and award every
          // milestone the learner has reached; the (userId, key) uniqueness
          // makes catch-ups and replays idempotent, so a learner never earns
          // the same milestone twice.
          const { completedModules, totalModules } = countCompletedModules(
            session.completedLessons ?? [],
            getRuntimeLessons()
          );
          const awards = resolveMilestoneAwards(rule.milestones, completedModules, totalModules);
          for (const award of awards) {
            await prisma.reward.upsert({
              where: {
                userId_module: { userId: session.userId, module: award.key }
              },
              update: {}, // an already-earned milestone is never re-issued or repriced
              create: {
                userId: session.userId,
                module: award.key,
                amount: award.amount,
                channel,
                status: "Pending",
                learnerPhone: session.phone
              }
            });
          }
          continue;
        }

        // Legacy flat mode: one reward per completed module.
        const envAmount = Number(process.env.REWARD_DEFAULT_AMOUNT);
        const fallbackAmount = Number.isFinite(envAmount) && envAmount > 0 ? envAmount : 500;
        const amount = rule?.amount ?? fallbackAmount;
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
      } else if (event.type === "help_requested") {
        // Raise the existing follow-up flag so the request lands in the
        // /users worklist instead of vanishing. Append rather than overwrite:
        // a learner may ask for help on several lessons.
        const stamp = new Date().toISOString().slice(0, 10);
        const existing = await prisma.user.findUnique({
          where: { id: session.userId },
          select: { followUpNote: true }
        });
        const merged = composeHelpRequestNote(existing?.followUpNote, event, stamp);
        const requestedAt = new Date();
        await prisma.user.update({
          where: { id: session.userId },
          // flaggedAt is separate from updatedAt so the "most recent help
          // requests" list cannot be reordered by an unrelated write.
          data: { flaggedForFollowUp: true, followUpNote: merged, flaggedAt: requestedAt }
        });
        console.log(
          JSON.stringify({
            event: "analytics.help_requested",
            userId: session.userId,
            lessonKey: event.lessonKey,
            module: event.module,
            questionIndex: event.questionIndex,
            at: nowIso()
          })
        );

        // Notify the support team. Best effort by design: the learner already
        // has their reply, the flag is already persisted, and a mail outage
        // must not fail the webhook or lose the request.
        const mail = await sendHelpRequestEmail({
          learnerName: session.name ?? null,
          phone: session.phone,
          lessonTitle: event.lessonTitle,
          moduleName: event.module,
          questionText: event.questionText,
          optionChosen: event.optionChosen,
          language: session.language ?? null,
          requestedAt: requestedAt.toISOString()
        });
        if (mail.status !== "sent") {
          console.warn(
            JSON.stringify({
              event: "notifications.help_request_email",
              status: mail.status,
              reason: "reason" in mail ? mail.reason : "",
              userId: session.userId
            })
          );
        }
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
  // R3-F2: a reset must be a true factory reset. The user row survives (it
  // holds analytics joins), but its stored language must not - otherwise the
  // next session rehydrates it and the diagnostics panel claims a language
  // before the learner has picked one this run.
  await prisma.user.updateMany({ data: { language: null } }).catch(() => {});
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
    // R3-F5/6/9: the stored state stays "module_menu" while a learner reads a
    // lesson or answers a quiz (the data lives in currentLessonKey /
    // awaitingQuizAnswer). Derive an honest label for the diagnostics panel
    // without touching the state machine.
    displayState: user.session.awaitingQuizAnswer
      ? "quiz_in_progress"
      : user.session.currentLessonKey
        ? "lesson_view"
        : (user.session.state as ConversationState),
    namePrompted: user.session.namePrompted,
    lastUpdatedAt: user.session.lastUpdatedAt.toISOString(),
    completedLessons: user.session.completedLessons,
    currentLessonKey: user.session.currentLessonKey,
    awaitingQuizAnswer: user.session.awaitingQuizAnswer,
    currentQuizIndex: user.session.currentQuizIndex,
    selectedModuleId: user.session.selectedModuleId
  };
}

