import type {
  AnalyticsPageData,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "./contracts.js";
import { getRuntimeText } from "../config-platform/runtime-config.js";

export const fallbackUsersData: UsersPageData = {
  users: []
};

export const fallbackAnalyticsData: AnalyticsPageData = {
  registrationRate: "0%",
  completionRate: "0%",
  passRate: "0%",
  funnelOverall: getRuntimeText("analytics.fallback.overall", "No live analytics available."),
  funnelAnambra: getRuntimeText("analytics.fallback.anambra", "No live analytics available."),
  funnelDelta: getRuntimeText("analytics.fallback.delta", "No live analytics available.")
};

export const fallbackContentData: ContentPageData = {
  lessons: []
};

export const fallbackRewardsData: RewardsPageData = {
  rewards: []
};

export const fallbackReportsData: ReportsPageData = {
  exports: []
};
