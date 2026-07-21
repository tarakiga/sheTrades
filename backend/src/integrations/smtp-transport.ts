import type { NotificationIntegrationPayload } from "../config-platform/contracts.js";

/**
 * Single source of truth for SMTP transport options.
 *
 * Previously the connection test and the help-request mailer each built their
 * own options object. That is exactly the kind of duplication that drifts: a
 * fix applied to one would silently not apply to the other, so a "Test
 * Connection" pass would stop proving that real mail can actually send.
 */
export type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
};

export function buildSmtpTransportOptions(
  config: Pick<
    NotificationIntegrationPayload,
    "host" | "port" | "secure" | "username" | "password"
  >,
  timeoutMs = 10_000
): SmtpTransportOptions {
  return {
    host: config.host,
    port: config.port,
    // true  = implicit TLS from the first byte (port 465)
    // false = plaintext connection upgraded via STARTTLS (port 587)
    secure: config.secure,
    /**
     * Force STARTTLS on the non-implicit path.
     *
     * Without this, nodemailer only upgrades if the server advertises STARTTLS
     * in its EHLO response, and otherwise proceeds to AUTH over a plaintext
     * channel. Many providers reject plaintext AUTH with `535 authentication
     * failed` — indistinguishable from a genuinely wrong password, which sends
     * admins hunting for a credentials problem that does not exist.
     *
     * Meaningless when `secure` is true (the channel is already encrypted), so
     * it is safe to set unconditionally on the false branch.
     */
    requireTLS: !config.secure,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: timeoutMs,
    // Some hosts accept the socket then stall before the greeting; without this
    // the request hangs until the platform-level timeout instead of failing.
    greetingTimeout: timeoutMs
  };
}
