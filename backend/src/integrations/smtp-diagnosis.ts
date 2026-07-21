/**
 * Turn a raw SMTP failure into something an admin can act on.
 *
 * The Test Connection panel previously surfaced the transport's own message —
 * e.g. "Invalid login: 535 5.7.8 Error: authentication failed:" — which is
 * accurate and unactionable. A non-technical admin cannot tell from that
 * whether to change the host, the port, the encryption mode, the username or
 * the password, so the usual response is to change all of them at random.
 *
 * Pure and exported so the mapping can be unit-tested without a mail server.
 */

export type SmtpDiagnosis = {
  /** One-line statement of what the server actually rejected. */
  summary: string;
  /** What to change next. */
  guidance: string;
  /** The raw server response, preserved so nothing is lost for debugging. */
  details: string;
};

type Rule = {
  match: RegExp;
  summary: string;
  guidance: string;
};

/**
 * Ordered: the first match wins, so specific patterns precede general ones.
 * `535` in particular must be checked before any generic "auth" wording.
 */
const RULES: Rule[] = [
  {
    // 534/5.7.9 — Gmail and others demanding an app password over a plain one.
    match: /534|5\.7\.9|application-specific password/i,
    summary: "The server requires an app-specific password.",
    guidance:
      "This provider does not accept your normal account password over SMTP. Generate an app-specific password in the mail provider's security settings and use that here."
  },
  {
    // 535/5.7.8 — credentials rejected. Reaching AUTH proves the transport is fine.
    match: /535|5\.7\.8|invalid login|authentication fail|auth.*(failed|denied)|bad credentials/i,
    summary: "The server rejected the username or password.",
    guidance:
      "The connection itself worked — host, port and encryption are correct, or the server would never have reached the login step. Check two things: the username is usually the FULL email address (help@example.com, not help), and the password is the mailbox password set when the email account was created, which is often different from the hosting control-panel password. If the mailbox is only an alias or forwarder it cannot log in at all; it must be a real mailbox."
  },
  {
    match: /wrong version number|ssl3_get_record|packet length too long|routines:.*ssl/i,
    summary: "The port and encryption mode do not match.",
    guidance:
      "Port 465 expects Secure SSL/TLS, and port 587 expects STARTTLS. Swapping them produces this error — set the encryption mode to match the port you entered."
  },
  {
    match: /self[- ]signed certificate|unable to verify the first certificate|cert/i,
    summary: "The server's TLS certificate could not be verified.",
    guidance:
      "This usually means the hostname does not match the certificate. Use the exact SMTP hostname the provider documents (for example smtp.provider.com) rather than your own domain name."
  },
  {
    match: /ENOTFOUND|EAI_AGAIN|getaddrinfo/i,
    summary: "The SMTP hostname could not be found.",
    guidance:
      "The host does not resolve — check it for a typo. It is usually the provider's mail host (smtp.provider.com), not your website domain."
  },
  {
    match: /ETIMEDOUT|timeout|timed out/i,
    summary: "The connection timed out.",
    guidance:
      "The host and port did not respond. Confirm the port number, and check whether outbound SMTP is blocked by a firewall on the network or by the mail provider."
  },
  {
    match: /ECONNREFUSED|ECONNRESET|EHOSTUNREACH/i,
    summary: "The server could not connect.",
    guidance:
      "The host refused the connection on that port. Confirm the SMTP host and port — most providers use 465 for Secure SSL/TLS or 587 for STARTTLS."
  },
  {
    // 550/553 — authenticated, but not allowed to send as that address.
    match: /550|553|relay|not permitted|sender address/i,
    summary: "The server refused the sender address.",
    guidance:
      "Login succeeded but the server will not send from this address. The 'From' address usually has to match the mailbox you authenticated as."
  }
];

const FALLBACK: Omit<Rule, "match"> = {
  summary: "SMTP connection failed.",
  guidance:
    "Check the host, port, encryption mode, username and password against the settings your mail provider documents. Most providers use port 465 with Secure SSL/TLS or port 587 with STARTTLS, and expect the full email address as the username."
};

export function diagnoseSmtpFailure(rawError: unknown): SmtpDiagnosis {
  const raw =
    rawError instanceof Error
      ? rawError.message
      : typeof rawError === "string"
        ? rawError
        : String(rawError ?? "");
  const details = raw.trim() || "No further detail was returned by the mail server.";

  const rule = RULES.find((candidate) => candidate.match.test(raw));
  return {
    summary: rule?.summary ?? FALLBACK.summary,
    guidance: rule?.guidance ?? FALLBACK.guidance,
    details
  };
}
