import type { RewardsSummary } from "./contracts.js";

/** One row of `SELECT status, count(*), sum(amount) ... GROUP BY status`. */
export type RewardStatusRow = { status: unknown; count: unknown; amount: unknown };

/**
 * Folds the GROUP BY rows into the summary the dashboard reads. Pure, so the
 * arithmetic is testable without a database; the provider's only job is the
 * query. Unknown or malformed rows contribute nothing rather than NaN - a
 * total that silently became NaN is how a hero ends up printing "₦NaN".
 */
export function summarizeRewardStatusRows(rows: RewardStatusRow[]): RewardsSummary {
  const byStatus = rows
    .map((row) => ({
      status: typeof row.status === "string" ? row.status : "",
      count: toCount(row.count),
      amount: toAmount(row.amount)
    }))
    .filter((row) => row.status.length > 0)
    .sort((a, b) => a.status.localeCompare(b.status));

  const total = byStatus.reduce(
    (acc, row) => ({ count: acc.count + row.count, amount: acc.amount + row.amount }),
    { count: 0, amount: 0 }
  );
  return { byStatus, total: { count: total.count, amount: round2(total.amount) } };
}

/** The count for one status, 0 when the status has no rows. */
export function summaryCount(summary: RewardsSummary | undefined, status: string): number {
  return summary?.byStatus.find((row) => row.status === status)?.count ?? 0;
}

/** The amount for one status, 0 when the status has no rows. */
export function summaryAmount(summary: RewardsSummary | undefined, status: string): number {
  return summary?.byStatus.find((row) => row.status === status)?.amount ?? 0;
}

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function toAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? round2(n) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
