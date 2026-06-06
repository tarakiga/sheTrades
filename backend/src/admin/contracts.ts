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

export type RewardsListMeta = {
  activeProvider: { key: "africas_talking" | "termii" | "reloadly"; sandbox: boolean } | null;
  nextCursor: string | null;
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
