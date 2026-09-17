import type { UsersSummary } from "./contracts.js";

/**
 * Keyset cursor for the learner directory, ordered (createdAt DESC, id DESC).
 *
 * createdAt alone is not a safe key here: 28,000 learners arrived in one
 * afternoon and TIMESTAMP(3) ties are real, and a cursor on the timestamp
 * alone would skip every learner who shares one with the last row of a page.
 * The id breaks ties, so no learner is skipped or repeated across pages.
 * Opaque to the client; ids are UUIDs and ISO timestamps contain no "~".
 */
export type UsersCursor = { createdAt: Date; id: string };

export function encodeUsersCursor(cursor: UsersCursor): string {
  return `${cursor.createdAt.toISOString()}~${cursor.id}`;
}

export function decodeUsersCursor(raw: string | undefined): UsersCursor | null {
  if (!raw) return null;
  const at = raw.indexOf("~");
  if (at <= 0 || at === raw.length - 1) return null;
  const createdAt = new Date(raw.slice(0, at));
  const id = raw.slice(at + 1);
  if (Number.isNaN(createdAt.getTime()) || id.length > 200) return null;
  return { createdAt, id };
}

/** One row of the directory summary query; Postgres hands counts back as text. */
export type UsersSummaryRow = {
  total: unknown;
  active: unknown;
  atRisk: unknown;
  flagged: unknown;
  averageCompletionPct: unknown;
};

/** Folds the summary row into numbers, so a malformed value is 0 rather than NaN on a tile. */
export function summarizeUsersRow(row: UsersSummaryRow | undefined): UsersSummary {
  return {
    total: toCount(row?.total),
    active: toCount(row?.active),
    atRisk: toCount(row?.atRisk),
    flagged: toCount(row?.flagged),
    averageCompletionPct: round1(toNumber(row?.averageCompletionPct))
  };
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toCount(value: unknown): number {
  const n = toNumber(value);
  return n >= 0 ? Math.trunc(n) : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
