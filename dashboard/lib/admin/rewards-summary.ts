import type { RewardsSummary } from "./contracts";

/** The count for one status, 0 when the summary is absent or has no such row. */
export function summaryCount(summary: RewardsSummary | undefined, status: string): number {
  return summary?.byStatus.find((row) => row.status === status)?.count ?? 0;
}

/** The amount for one status, 0 when the summary is absent or has no such row. */
export function summaryAmount(summary: RewardsSummary | undefined, status: string): number {
  return summary?.byStatus.find((row) => row.status === status)?.amount ?? 0;
}
