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
};

export type UsersPageData = {
  users: Array<UserRow>;
};

export type AnalyticsPageData = {
  registrationRate: string;
  completionRate: string;
  passRate: string;
  funnelOverall: string;
  funnelAnambra: string;
  funnelDelta: string;
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
  learner: string;
  module: string;
  amount: string;
  channel: string;
  status: "Issued" | "Pending" | "Failed";
};

export type RewardsPageData = {
  rewards: Array<RewardLogRow>;
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
