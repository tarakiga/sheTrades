import nodemailer from "nodemailer";
import type { NotificationIntegrationPayload } from "../config-platform/contracts.js";
import { getRuntimeNotificationConfig, getRuntimeText } from "../config-platform/runtime-config.js";
import { buildSmtpTransportOptions } from "../integrations/smtp-transport.js";

/**
 * Emails the support team when a learner asks for help from inside a lesson.
 *
 * Before this existed the request only raised a flag on the learner record,
 * which nobody was notified about — it sat until someone happened to open the
 * /users page. A learner explicitly saying "I am stuck" is the most actionable
 * signal the bot produces, so it should reach a human without anyone polling.
 *
 * Everything here is best-effort: a broken SMTP config must never turn into a
 * failed webhook. The learner already got their reply by the time this runs.
 */

export type HelpRequestContext = {
  learnerName: string | null;
  phone: string;
  lessonTitle: string;
  moduleName: string;
  questionText: string;
  optionChosen: string;
  language: string | null;
  requestedAt: string;
};

export type SendResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type Dependencies = {
  createTransport?: typeof nodemailer.createTransport;
  loadConfig?: () => NotificationIntegrationPayload | null;
};

/**
 * Where help requests are sent. Admin-editable per the CLAUDE.md mandate rather
 * than baked into code: config first, then env, then a safe default so the
 * feature still works on a fresh deploy with nothing configured.
 */
export function resolveHelpRequestRecipient(): string {
  const configured = getRuntimeText("notifications.help_request.recipient", "").trim();
  if (configured) return configured;
  const fromEnv = (process.env.HELP_REQUEST_NOTIFY_EMAIL ?? "").trim();
  if (fromEnv) return fromEnv;
  return "help@shetrades.digital";
}

function languageLabel(language: string | null): string {
  if (language === "pcm") return "Nigerian Pidgin";
  if (language === "ig") return "Igbo";
  if (language === "en") return "English";
  return "not set";
}

/**
 * Plain-text body. Deliberately not HTML: this goes to a shared support inbox
 * that may be read on a phone, and the useful content is six short facts.
 */
export function buildHelpRequestEmail(context: HelpRequestContext): {
  subject: string;
  text: string;
} {
  const name = context.learnerName?.trim() || "A learner";
  const subject = `Help requested: ${name} — ${context.lessonTitle}`;

  const text = [
    `${name} asked for help while taking a lesson on WhatsApp.`,
    ``,
    `Learner:        ${context.learnerName?.trim() || "(name not captured)"}`,
    `WhatsApp:       ${context.phone}`,
    `Language:       ${languageLabel(context.language)}`,
    ``,
    `Module:         ${context.moduleName}`,
    `Lesson:         ${context.lessonTitle}`,
    `Question:       ${context.questionText}`,
    `They answered:  "${context.optionChosen}"`,
    ``,
    `Requested at:   ${context.requestedAt}`,
    ``,
    `This learner is now flagged for follow-up in the admin dashboard, under`,
    `Users. Reply to them on WhatsApp at the number above.`,
    ``,
    `— SheTrades learning bot`
  ].join("\n");

  return { subject, text };
}

export async function sendHelpRequestEmail(
  context: HelpRequestContext,
  dependencies: Dependencies = {}
): Promise<SendResult> {
  const loadConfig = dependencies.loadConfig ?? getRuntimeNotificationConfig;
  const config = loadConfig();

  if (!config) {
    return { status: "skipped", reason: "No SMTP integration configured." };
  }
  if (config.enabled === false) {
    return { status: "skipped", reason: "SMTP integration is disabled." };
  }

  const recipient = resolveHelpRequestRecipient();
  const { subject, text } = buildHelpRequestEmail(context);
  const createTransport = dependencies.createTransport ?? nodemailer.createTransport;

  try {
    // Same options object the Test Connection panel uses, so "the test passed"
    // and "mail actually sends" cannot diverge.
    const transporter = createTransport(buildSmtpTransportOptions(config, 5000));

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: recipient,
      ...(config.replyToEmail ? { replyTo: config.replyToEmail } : {}),
      subject,
      text
    });

    return { status: "sent", messageId: String(info?.messageId ?? "") };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
