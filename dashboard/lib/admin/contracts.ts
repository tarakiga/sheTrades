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
