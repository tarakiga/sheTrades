import { randomBytes } from "node:crypto";

/**
 * Completion-certificate rules — pure functions, no database and no clock of
 * their own, so eligibility and name handling are unit-testable without
 * standing up a bot or a Postgres connection. The renderer, routes and bot
 * flow (later tasks) call into this module; it never calls back into them.
 */

/** Cap that fits the artwork at the smallest supported font size. */
export const MAX_NAME_LENGTH = 60;

export type Completion = { completedModules: number; totalModules: number };

/**
 * True only once every module is complete. `totalModules > 0` is the guard
 * that matters: before any lessons are published both counts are zero, and a
 * bare `completedModules >= totalModules` would issue a certificate to
 * anyone who had merely started a conversation.
 */
export function isEligible(c: Completion): boolean {
  return c.totalModules > 0 && c.completedModules >= c.totalModules;
}

export type SanitiseResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_long" };

// Control chars (C0 + C1), zero-width spaces/joiners, bidi controls, and the
// BOM. Bidi overrides (U+202E RIGHT-TO-LEFT OVERRIDE and friends) are the
// classic trick for making text render in reversed order to disguise what
// it actually says; on a publicly verifiable credential that is a spoofing
// vector, not a cosmetic bug. \u200E and \u200F (LRM/RLM) are already
// covered by the \u200B-\u200F run below, so they are not repeated.
//
// U+200D ZERO WIDTH JOINER also falls inside that run, so multi-codepoint
// emoji (which ZWJ glues into one glyph) split into separate glyphs here.
// That is a deliberate tradeoff for a name field on a formal certificate,
// not an oversight -- do not "fix" it by carving ZWJ out of the range.
//
// Kept as a literal escape-sequence regex (never literal invisible
// characters) so the source stays legible in any editor or diff tool.
// eslint-disable-next-line no-control-regex -- the control range IS the point of this regex, not a mistake.
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// Unpaired surrogates only -- a well-formed pair (an astral emoji) is a
// legitimate character. Not folded into INVISIBLE_CHARS above because a
// character class cannot express the lookaround needed to tell a paired
// half from a lone one; kept as a second pass instead. On a name that
// reaches a UTF-8-encoding boundary unnoticed, a lone surrogate silently
// becomes U+FFFD -- the same failure this function already treats as
// worth stripping, not silently mangling.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitiseLearnerName(raw: string): SanitiseResult {
  // NFC before trim/collapse: a combining-mark spelling ("e" + U+0301) and
  // its precomposed form (an e with an accent) must land as the same stored
  // value, or the length cap measures an arbitrary encoding rather than the
  // name, and two learners who typed "the same" name would later compare
  // unequal.
  const stripped = raw.replace(INVISIBLE_CHARS, "").replace(LONE_SURROGATE, "").normalize("NFC");
  const value = stripped.trim().replace(/\s+/g, " ");

  if (value.length === 0) return { ok: false, reason: "empty" };
  // Reject, don't truncate: chopping a name would print half of it on a
  // permanent credential. Better to ask the learner again.
  if (value.length > MAX_NAME_LENGTH) return { ok: false, reason: "too_long" };
  // Do NOT change capitalisation: Nigerian names carry legitimate irregular
  // casing ("chukwuEMEKA"), and "correcting" it would be confidently wrong.
  return { ok: true, value };
}

export type NameCheck =
  | { ok: true }
  | { ok: false; reason: "no_letters" | "reply_word" | "phone_number" | "machine_id" };

/** Lowercase, punctuation stripped, whitespace collapsed: "Hi!" and " HI. " are the same reply. */
function comparableReply(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a sanitised value is plausibly a person's name, rather than
 * something the learner sent while the bot happened to be waiting for one.
 *
 * sanitiseLearnerName only decides whether a value CAN be printed. This
 * decides whether it SHOULD be: by October 2026, 793 of 10,496 certificates
 * read "CONTINUE" (a second tap on the privacy notice button), "Hi", "EXIT",
 * "3", "." or a phone number, because the name step accepted any reply.
 *
 * `replyWords` are the bot's own button labels and commands plus greetings,
 * resolved by the caller from published config, so this stays pure and the
 * list stays editable without a deploy. Deliberately narrow: a single name
 * ("Aisha") and a handle with digits ("Tosadep01") pass, because rejecting a
 * real name is worse than printing an odd one.
 */
export function looksLikeAName(value: string, replyWords: Iterable<string>): NameCheck {
  // First, so a bare number is logged as what it is. Seven or more digits,
  // allowing the spaces and dashes people type inside a phone number. A
  // printed phone number is a privacy leak on a page anyone with the link can
  // open, not just an odd name.
  if (/\d{7,}/.test(value.replace(/[\s()+-]/g, ""))) return { ok: false, reason: "phone_number" };

  const letters = value.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2) return { ok: false, reason: "no_letters" };

  const reply = comparableReply(value);
  for (const word of replyWords) {
    if (comparableReply(word) === reply) return { ok: false, reason: "reply_word" };
  }

  // One unbroken token holding a digit and a separator: "content.lesson.m3_l1_d"
  // or "module-4", a list row id echoed back by a stale tap.
  if (!/\s/.test(value) && /\d/.test(value) && /[._-]/.test(value)) {
    return { ok: false, reason: "machine_id" };
  }

  return { ok: true };
}

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/**
 * 32 lowercase base32 characters, sourced from `randomBytes` (not
 * `Math.random`, which is not cryptographically unguessable) because this id
 * appears in a public verification URL: certificates must not be enumerable
 * by walking ids. Lowercase and digit-restricted so it survives being read
 * aloud or retyped from a printout.
 *
 * One source byte maps to one output character via `byte % 32`. 256 is an
 * exact multiple of 32, so every alphabet character gets exactly 8 of the
 * 256 possible byte values — the modulo introduces no bias.
 */
export function generatePublicId(): string {
  const bytes = randomBytes(32);
  let id = "";
  for (const byte of bytes) {
    id += BASE32_ALPHABET[byte % 32];
  }
  return id;
}
