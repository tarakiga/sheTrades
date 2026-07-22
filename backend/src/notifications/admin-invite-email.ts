import nodemailer from "nodemailer";
import type { NotificationIntegrationPayload } from "../config-platform/contracts.js";
import { getRuntimeNotificationConfig, getRuntimeText } from "../config-platform/runtime-config.js";
import { buildSmtpTransportOptions } from "../integrations/smtp-transport.js";

/**
 * Emails a newly-added admin team member to tell them an account exists and that
 * they should log in. Sent when an admin creates a member from Settings → Admins.
 *
 * Security: the email NEVER contains the password. The creating admin sets an
 * initial password and shares it out of band; this message only confirms the
 * account and points at the login page. Emailing credentials would put a
 * working password in an inbox and mail logs.
 *
 * Best-effort, exactly like the help-request email: a missing or broken SMTP
 * config must never fail the account creation that already succeeded.
 */

export type AdminInviteContext = {
  fullName: string;
  email: string;
  role: string;
  invitedByName: string | null;
};

export type SendResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type Dependencies = {
  createTransport?: typeof nodemailer.createTransport;
  loadConfig?: () => NotificationIntegrationPayload | null;
};

function roleLabel(role: string): string {
  if (role === "admin") return "Administrator";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return role;
}

/**
 * Where the new member logs in. Admin-editable per the CLAUDE.md mandate: config
 * first, then env, then the first configured dashboard origin, so a fresh deploy
 * still produces a working link without extra setup. Returns null when nothing is
 * known, in which case the email omits the explicit link.
 */
export function resolveAdminLoginUrl(): string | null {
  const fromConfig = getRuntimeText("admin.invite.login_url", "").trim();
  if (fromConfig) return fromConfig;

  const fromEnv = (process.env.ADMIN_DASHBOARD_URL ?? "").trim();
  if (fromEnv) return `${fromEnv.replace(/\/+$/, "")}/login`;

  const firstCorsOrigin = (process.env.BACKEND_CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .find((origin) => origin.length > 0);
  if (firstCorsOrigin) return `${firstCorsOrigin.replace(/\/+$/, "")}/login`;

  return null;
}

/**
 * Plain-text body (matches the help-request email house style): a shared inbox
 * on a phone should be able to read the essentials without HTML.
 */
export function buildAdminInviteEmail(
  context: AdminInviteContext,
  loginUrl: string | null
): { subject: string; text: string } {
  const name = context.fullName.trim() || "there";
  const invitedBy = context.invitedByName?.trim();
  const subject = "You have been added to the SheTrades admin dashboard";

  const lines: string[] = [
    `Hi ${name},`,
    ``,
    invitedBy
      ? `${invitedBy} has added you to the SheTrades admin dashboard.`
      : `You have been added to the SheTrades admin dashboard.`,
    ``,
    `Role:   ${roleLabel(context.role)}`,
    `Sign in with this email address: ${context.email}`,
    ``
  ];

  if (loginUrl) {
    lines.push(`Log in here: ${loginUrl}`);
  } else {
    lines.push(`Log in using the dashboard link your administrator shares with you.`);
  }

  lines.push(
    ``,
    `For your security, your password is not included in this email. Use the`,
    `password your administrator set for you, then change it after your first`,
    `sign-in from your profile page.`,
    ``,
    `SheTrades admin`
  );

  return { subject, text: lines.join("\n") };
}

export async function sendAdminInviteEmail(
  context: AdminInviteContext,
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

  const loginUrl = resolveAdminLoginUrl();
  const { subject, text } = buildAdminInviteEmail(context, loginUrl);
  const createTransport = dependencies.createTransport ?? nodemailer.createTransport;

  try {
    const transporter = createTransport(buildSmtpTransportOptions(config, 5000));
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: context.email,
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
