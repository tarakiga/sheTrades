import { daysBetween, median, watMonth } from "./learner-journey.js";

/**
 * The monthly "Donor summary": disbursements by month, and since v3 how many
 * learners enrolled and completed in that month and how long completion took.
 * Months are West Africa Time, like every timestamp in the donor reports.
 * Pure: the export service fetches the three inputs and hands them here.
 */

export type RewardInput = {
  userId: string;
  status: string;
  amount: number;
  issuedAt: Date | string | null;
  createdAt: Date | string;
};

export type CompletionInput = {
  issuedAt: Date | string;
  enrolledAt: Date | string | null;
};

export type DonorSummaryInput = {
  rewards: RewardInput[];
  /** One entry per learner who accepted the privacy notice: when she did. */
  enrolments: Array<Date | string>;
  /** One entry per unrevoked certificate: when it was issued, and when she had enrolled. */
  completions: CompletionInput[];
};

export const DONOR_SUMMARY_COLUMNS = [
  "period",
  "recipients",
  "rewardsIssued",
  "totalNgnIssued",
  "learnersEnrolled",
  "learnersCompleted",
  "medianDaysToComplete"
];

type MonthAgg = {
  recipients: Set<string>;
  issued: number;
  total: number;
  enrolled: number;
  completed: number;
  daysToComplete: number[];
};

function agg(map: Map<string, MonthAgg>, period: string): MonthAgg {
  let m = map.get(period);
  if (!m) {
    m = { recipients: new Set(), issued: 0, total: 0, enrolled: 0, completed: 0, daysToComplete: [] };
    map.set(period, m);
  }
  return m;
}

/** Rows newest month first, aligned with DONOR_SUMMARY_COLUMNS. */
export function buildDonorSummaryRows(input: DonorSummaryInput): string[][] {
  const byPeriod = new Map<string, MonthAgg>();

  for (const r of input.rewards) {
    const period = watMonth(r.issuedAt ?? r.createdAt);
    if (!period) continue;
    const m = agg(byPeriod, period);
    m.recipients.add(r.userId);
    if (r.status === "Issued") {
      m.issued += 1;
      m.total += Number.isFinite(r.amount) ? r.amount : 0;
    }
  }
  for (const at of input.enrolments) {
    const period = watMonth(at);
    if (period) agg(byPeriod, period).enrolled += 1;
  }
  for (const c of input.completions) {
    const period = watMonth(c.issuedAt);
    if (!period) continue;
    const m = agg(byPeriod, period);
    m.completed += 1;
    const days = daysBetween(c.enrolledAt, c.issuedAt);
    if (days !== null) m.daysToComplete.push(days);
  }

  return [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([period, m]) => {
      const med = median(m.daysToComplete);
      return [
        period,
        String(m.recipients.size),
        String(m.issued),
        String(Math.round(m.total)),
        String(m.enrolled),
        String(m.completed),
        med === null ? "" : med.toFixed(1)
      ];
    });
}
