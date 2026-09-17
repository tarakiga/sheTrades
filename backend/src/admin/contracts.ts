export type UserRow = {
  name: string;
  phone: string;
  location: string;
  language: string;
  completion: string;
  status: "Active" | "At Risk";
  flaggedForFollowUp: boolean;
};

export type UsersPageData = {
  users: Array<UserRow>;
};

export type StateFunnel = {
  state: string;
  registered: number;
  completed: number;
  passed: number;
  completionRate: string;
  passRate: string;
};

export type AnalyticsPageData = {
  registrationRate: string;
  completionRate: string;
  passRate: string;
  funnelOverall: string;
  /**
   * The five funnel counts as numbers, straight from the aggregate. Present
   * only when the figures come from a live COUNT over the whole learner table;
   * absent from snapshots and fixtures, so a page can say "unknown" rather
   * than print a 0 or, worse, the length of a capped list.
   */
  overall?: AnalyticsOverallCounts;
  // Per-state breakdown, computed dynamically (one entry per location the
  // learners actually have) — not a fixed Anambra/Delta pair.
  stateFunnels: StateFunnel[];
};

export type LessonRow = {
  module: string;
  lesson: string;
  language: string;
  quiz: string;
  status: "Published" | "Draft";
};

export type ContentPageData = {
  lessons: Array<LessonRow>;
};

export type RewardLogRow = {
  id: string;
  learner: string;
  learnerPhone: string;
  module: string;
  amount: number;
  currency: "NGN";
  channel: string;
  status: "Issued" | "Pending" | "Failed";
  createdAt: string;        // ISO
  issuedAt: string | null;  // ISO or null
  providerTxnId: string | null;
  failureReason: string | null;
  retryCount: number;
  noteFromActor: string | null;
};

/** Whole-table reward totals by status, independent of the page the list shows. */
export type RewardsSummary = {
  byStatus: Array<{ status: string; count: number; amount: number }>;
  total: { count: number; amount: number };
};

export type AnalyticsOverallCounts = {
  registered: number;
  started: number;
  completed: number;
  attempted: number;
  passed: number;
};

export type RewardsListMeta = {
  activeProvider: { key: "africas_talking" | "termii" | "reloadly"; sandbox: boolean } | null;
  nextCursor: string | null;
  /**
   * Totals over EVERY reward matching the date range and search (not the
   * status filter, since it is broken down by status, and not the cursor).
   * The list is one page; a hero or a tile that adds up the page is wrong
   * as soon as there is a second page. Absent from Firestore and fixtures.
   */
  summary?: RewardsSummary;
};

export type RewardsPageData = {
  rewards: Array<RewardLogRow>;
  meta: RewardsListMeta;
};

export type ExportRow = {
  report: string;
  format: string;
  generatedAt: string;
  owner: string;
  status: "Ready" | "Queued";
};

export type ReportsPageData = {
  exports: Array<ExportRow>;
};
