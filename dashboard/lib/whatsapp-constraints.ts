/**
 * WhatsApp message constraints for the content editor — mirrors
 * `backend/src/whatsapp/constraints.ts` (limits) and the message composition in
 * `backend/src/whatsapp/handler.ts` + defaults in `bot-prompts.ts`.
 *
 * There is no shared package across the app/backend boundary, so these are kept
 * in sync by hand. The point of the compose helpers is that admins see the REAL
 * on-device length — content PLUS the fixed "chrome" the bot wraps around it
 * (the 📖 prefix, quiz instruction, numbered option lines, etc.) — not just the
 * characters they typed. WhatsApp counts UTF-16 code units (emoji = 2), which is
 * exactly what JS `String.length` returns.
 */

export const WHATSAPP_LIMITS = {
  /** Interactive message body (buttons/list). Over this, WhatsApp REJECTS (#131009). */
  interactiveBody: 1024,
  /** Plain text message body. */
  plainText: 4096,
  /** Reply-button title. Over this the title is silently TRUNCATED on send. */
  buttonTitle: 20,
  /** List row title. */
  listRowTitle: 24,
  /** List row description (where the lesson title is shown when browsing). */
  listRowDescription: 72,
  maxButtons: 3,
  maxListRows: 10
} as const;

export type WhatsAppLang = "en" | "pcm" | "ig";

/** UTF-16 code-unit length — WhatsApp's counting unit (emoji count as 2). */
export function waLen(value: string): number {
  return (value ?? "").length;
}

// --- Bot "chrome" (mirrors BOT_PROMPT_DEFAULTS in backend bot-prompts.ts) ------
// These are the shipped defaults; admins can override them in config, so treat
// the composed totals below as a close estimate of on-device length.

const BOT_LESSON_PREFIX = "📖 ";

const BOT_QUIZ_INSTRUCTION: Record<WhatsAppLang, string> = {
  en: "\n-------------------------\nReply QUIZ to start the lesson quiz, or MENU to return.",
  pcm: "\n-------------------------\nReply QUIZ to start lesson quiz, or MENU to go back.",
  ig: "\n-------------------------\nReply QUIZ ka ịmalite ule, ma ọ bụ MENU ka ịlaghachi."
};

const BOT_QUIZ_TIME_HEADER: Record<WhatsAppLang, string> = {
  en: "📚 Quiz Time! Question:\n",
  pcm: "📚 Time for small quiz! Question:\n",
  ig: "📚 Oge Ule! Ajụjụ:\n"
};

const BOT_QUIZ_ANSWER_PROMPT: Record<WhatsAppLang, string> = {
  en: "\n\nSelect your answer below or reply MENU to return.",
  pcm: "\n\nSelect your answer below or reply MENU to go back.",
  ig: "\n\nHọrọ azịza gị n'okpuru ma ọ bụ pịnye MENU ka ịlaghachi."
};

export type ComposedLength = {
  /** Full on-device length: content + bot chrome. */
  total: number;
  /** The portion added by the bot (not typed by the admin). */
  systemChars: number;
  /** The applicable hard limit. */
  limit: number;
};

/**
 * Composed length of the delivered lesson message:
 *   `📖 {title}\n\n{body}{quizInstruction}` — must fit `interactiveBody` (1024).
 */
export function composeLessonBody(title: string, body: string, lang: WhatsAppLang): ComposedLength {
  const systemChars =
    waLen(BOT_LESSON_PREFIX) + waLen(title) + waLen("\n\n") + waLen(BOT_QUIZ_INSTRUCTION[lang]);
  return { total: systemChars + waLen(body), systemChars, limit: WHATSAPP_LIMITS.interactiveBody };
}

/**
 * Composed length of the delivered quiz-question message:
 *   header + `{question}\n` + numbered option lines + answer prompt.
 * Must fit `interactiveBody` (1024). Option texts are also individually capped
 * at `buttonTitle` (20) — see composeQuizOption.
 */
export function composeQuizQuestion(question: string, options: string[], lang: WhatsAppLang): ComposedLength {
  const optionLines = options.reduce((sum, opt, i) => sum + waLen(`${i + 1}. ${opt}\n`), 0);
  const rawOptionText = options.reduce((sum, opt) => sum + waLen(opt), 0);
  const total = waLen(BOT_QUIZ_TIME_HEADER[lang]) + waLen(question) + waLen("\n") + optionLines + waLen(BOT_QUIZ_ANSWER_PROMPT[lang]);
  const systemChars = total - waLen(question) - rawOptionText;
  return { total, systemChars, limit: WHATSAPP_LIMITS.interactiveBody };
}
