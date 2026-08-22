import { randomBytes } from "node:crypto";

/**
 * The decisions behind the privacy gate and the erasure path, with no database
 * and no WhatsApp in the way.
 *
 * Everything here is a rule rather than a mechanism, and every rule is one
 * somebody may later have to defend to a participant or a regulator. That is
 * the reason they are separated out and tested directly rather than left inline
 * in a 2,700-line message handler.
 */

/** Config key suffix under `bot.prompt.` for the notice itself. */
export const CONSENT_NOTICE_KEY = "privacy_notice";

export type ConsentDecision = "accepted" | "declined";

/**
 * Whether this participant must be shown the notice before anything else.
 *
 * `publishedVersion` is the version of the notice document that is live now;
 * `consentVersion` is the version she last agreed to, or null if she never has.
 *
 * `reconsentFromVersion` is the deliberate re-consent lever: set it to a
 * version number and everyone who agreed to something OLDER is asked again.
 * Left null, republishing the notice does NOT re-prompt anybody — which is the
 * behaviour you want, because otherwise fixing a typo interrupts every learner
 * mid-lesson to re-accept a document that has not materially changed. Deciding
 * that a change IS material is a human judgement, so it gets a human switch.
 */
export function needsConsent(input: {
  consentVersion: number | null | undefined;
  reconsentFromVersion?: number | null | undefined;
}): boolean {
  const agreed = input.consentVersion;
  if (agreed === null || agreed === undefined) return true;

  const floor = input.reconsentFromVersion;
  if (floor === null || floor === undefined) return false;
  return agreed < floor;
}

/**
 * Reads a reply to the notice.
 *
 * A tapped button arrives as its TITLE, and those titles are admin-editable
 * config — so matching hard-coded strings would silently break the gate the
 * first time somebody renames a button from "CONTINUE" to "Yes, continue".
 * The published labels are therefore passed in and matched first.
 *
 * The typed fallbacks exist because a participant on a poor connection, or one
 * whose client did not render the buttons, will type the word instead. They are
 * additions to the published labels, never a replacement for them.
 *
 * Anything else is "unclear", and an unclear answer is NOT consent. The notice
 * is simply shown again.
 */
export function resolveConsentReply(
  text: string,
  labels: { accept: string; decline: string }
): ConsentDecision | "unclear" {
  const value = normalise(text);
  if (value.length === 0) return "unclear";

  const accept = normalise(labels.accept);
  const decline = normalise(labels.decline);

  // Decline is checked FIRST. If an admin ever publishes labels where one
  // contains the other ("continue" / "do not continue"), the safe reading of an
  // ambiguous tap is the one that collects no data.
  if (decline.length > 0 && value === decline) return "declined";
  if (accept.length > 0 && value === accept) return "accepted";

  if (DECLINE_WORDS.has(value)) return "declined";
  if (ACCEPT_WORDS.has(value)) return "accepted";

  return "unclear";
}

const ACCEPT_WORDS = new Set(["continue", "yes", "y", "ok", "okay", "agree", "accept", "proceed", "start"]);
const DECLINE_WORDS = new Set(["exit", "no", "n", "stop", "cancel", "decline", "quit", "leave"]);

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The order tables must be cleared in for an erasure to succeed.
 *
 * Every learner relation except certificates is ON DELETE RESTRICT, so a single
 * `DELETE FROM users` fails. Children come first, the user last.
 *
 * `outbound_messages` is the one that needs saying out loud: it has NO foreign
 * key, only a phone string. It will not cascade and it will not block, so an
 * erasure that forgets it reports success while leaving her number, and every
 * message staff sent her, in the database.
 *
 * `consent_events` cascades from users, so it does not strictly need to be
 * here. It is listed anyway, because the count belongs in the erasure log and
 * because a reader should not have to know which relations cascade to know what
 * an erasure removes.
 */
export const ERASURE_ORDER = [
  "certificates",
  "rewards",
  "quiz_attempts",
  "user_progress",
  "consent_events",
  "user_sessions",
  "outbound_messages",
  "users"
] as const;

export type ErasureTable = (typeof ERASURE_ORDER)[number];

/**
 * Characters for a reference a participant may have to read off a screen and
 * say down a phone line. No 0/O, no 1/I/L: a reference that cannot be
 * transcribed is not a reference.
 */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * The reference given to a participant when her data is erased.
 *
 * It is the ONLY thing connecting her to the erasure log, and it is one-way:
 * the log stores it, she is told it, and nothing stored anywhere links it back
 * to a name or a number. She can quote it to ask "was my request carried out";
 * it cannot be used to find out who she was.
 */
export function generateRequestRef(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const byte of bytes) {
    out += REF_ALPHABET[byte % REF_ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
