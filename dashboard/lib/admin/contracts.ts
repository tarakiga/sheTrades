export type DataSourceMeta = {
  source: "live" | "fallback";
  message?: string;
};

export type ApiResult<T> = {
  data: T;
  meta: DataSourceMeta;
};

export type UserRow = {
  name: string;
  phone: string;
  location: string;
  language: string;
  completion: string;
  status: "Active" | "At Risk";
  flaggedForFollowUp: boolean;
};

export type LearnerDetail = {
  identity: {
    id: string;
    name: string | null;
    phone: string;
    location: string | null;
    language: string | null;
    status: string;
    flaggedForFollowUp: boolean;
    followUpNote: string | null;
    createdAt: string;
  };
  session: {
    state: string | null;
    currentLessonKey: string | null;
    completedLessons: string[];
    lastUpdatedAt: string | null;
  } | null;
  progress: Array<{ module: string; completionPercentage: number; updatedAt: string }>;
  quizAttempts: Array<{ lessonKey: string; passed: boolean; attemptCount: number; lastAttemptAt: string }>;
  rewards: Array<{ id: string; module: string; amount: number; channel: string; status: string; issuedAt: string | null; createdAt: string }>;
  /** Absent when she has not earned one. Carries no phone number and no
   * template snapshot - the drawer shows status and links to the public
   * page, nothing more. */
  certificate?: {
    id: string;
    publicId: string;
    learnerName: string;
    issuedAt: string;
    revokedAt: string | null;
  };
  /** Her latest privacy decision and the version of the notice she was shown
   * when she gave it. The notice is editable, so the version is what makes the
   * decision mean anything. Absent for anyone never asked. */
  consent?: {
    decision: string;
    noticeVersion: number;
    language: string;
    decidedAt: string;
    decisionCount: number;
  };
};

/** Whole-directory counts for the same search and filters as the page (not the cursor). */
export type UsersSummary = {
  total: number;
  active: number;
  atRisk: number;
  flagged: number;
  averageCompletionPct: number;
};

export type UsersListMeta = {
  nextCursor: string | null;
  summary?: UsersSummary;
};

export type UsersPageData = {
  users: Array<UserRow>;
  // Absent from an older backend or fallback data. The page then shows its
  // loaded rows and says the count is of those rows only.
  meta?: UsersListMeta;
};

export type StateFunnel = {
  state: string;
  registered: number;
  completed: number;
  passed: number;
  completionRate: string;
  passRate: string;
};

/** The five funnel counts as numbers, present only when they come from a live aggregate. */
export type AnalyticsOverallCounts = {
  registered: number;
  started: number;
  completed: number;
  attempted: number;
  passed: number;
};

export type AnalyticsPageData = {
  registrationRate: string;
  completionRate: string;
  passRate: string;
  funnelOverall: string;
  // Absent from snapshots and fixtures. A tile shows "n/a" then, never the
  // length of whatever list it happened to have loaded.
  overall?: AnalyticsOverallCounts;
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
  createdAt: string;
  issuedAt: string | null;
  providerTxnId: string | null;
  failureReason: string | null;
  retryCount: number;
  noteFromActor: string | null;
};

export type RewardsListMeta = {
  activeProvider: { key: "africas_talking" | "termii" | "reloadly"; sandbox: boolean } | null;
  nextCursor: string | null;
  // Manual-reward defaults sourced from the published Reward Rule (admin-set).
  defaults?: { amount: number; channel: string } | null;
  // Whole-table totals for the period and search, by status. The list is one
  // page; anything that adds the page up is describing 25 rows.
  summary?: RewardsSummary;
};

export type RewardsSummary = {
  byStatus: Array<{ status: string; count: number; amount: number }>;
  total: { count: number; amount: number };
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

/**
 * A learner who asked for help from inside a lesson check-in. The flag is
 * raised automatically by the bot, not by an admin.
 */
export type HelpRequestRow = {
  phone: string;
  name: string | null;
  language: string | null;
  location: string | null;
  /** Newest note line only; the learner drawer shows the full history. */
  latestNote: string;
  flaggedAt: string | null;
};

export type HelpRequestsData = {
  requests: HelpRequestRow[];
};
