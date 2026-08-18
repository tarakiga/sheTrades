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

// Control chars (C0 + C1), zero-width spaces/joiners, and the BOM. Kept as a
// literal escape-sequence regex (never literal invisible characters) so the
// source stays legible in any editor or diff tool.
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g;

export function sanitiseLearnerName(raw: string): SanitiseResult {
  const stripped = raw.replace(INVISIBLE_CHARS, "");
  const value = stripped.trim().replace(/\s+/g, " ");

  if (value.length === 0) return { ok: false, reason: "empty" };
  // Reject, don't truncate: chopping a name would print half of it on a
  // permanent credential. Better to ask the learner again.
  if (value.length > MAX_NAME_LENGTH) return { ok: false, reason: "too_long" };
  // Do NOT change capitalisation: Nigerian names carry legitimate irregular
  // casing ("chukwuEMEKA"), and "correcting" it would be confidently wrong.
  return { ok: true, value };
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
