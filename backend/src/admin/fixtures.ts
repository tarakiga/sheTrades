import type {
  AnalyticsPageData,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "./contracts.js";

export const fallbackUsersData: UsersPageData = {
  users: [
    {
      name: "Amaka Obi",
      phone: "+234800000001",
      location: "Anambra",
      language: "English",
      completion: "78%",
      status: "Active"
    },
    {
      name: "Ruth Okon",
      phone: "+234800000002",
      location: "Delta",
      language: "Pidgin",
      completion: "34%",
      status: "At Risk"
    },
    {
      name: "Ifeoma Nnadi",
      phone: "+234800000003",
      location: "Anambra",
      language: "Igbo",
      completion: "65%",
      status: "Active"
    }
  ]
};

export const fallbackAnalyticsData: AnalyticsPageData = {
  registrationRate: "72.4%",
  completionRate: "34.8%",
  passRate: "63.1%",
  funnelOverall:
    "Onboarding 20,412 -> Language Set 18,920 -> Module Start 13,907 -> Quiz Attempt 8,112 -> Complete 7,104",
  funnelAnambra: "Completion 37.2% | Pass 64.8%",
  funnelDelta: "Completion 31.5% | Pass 61.3%"
};

export const fallbackContentData: ContentPageData = {
  lessons: [
    {
      module: "Module 1",
      lesson: "Pricing Basics",
      language: "EN/PCM/IG",
      quiz: "5 questions",
      status: "Published"
    },
    {
      module: "Module 2",
      lesson: "Record Keeping",
      language: "EN/PCM",
      quiz: "4 questions",
      status: "Draft"
    }
  ]
};

export const fallbackRewardsData: RewardsPageData = {
  rewards: [
    {
      learner: "Amaka Obi",
      module: "Module 2",
      amount: "NGN 200",
      channel: "Airtime API",
      status: "Issued"
    },
    {
      learner: "Ruth Okon",
      module: "Module 1",
      amount: "NGN 200",
      channel: "Manual",
      status: "Pending"
    },
    {
      learner: "Gift James",
      module: "Module 3",
      amount: "NGN 300",
      channel: "Airtime API",
      status: "Failed"
    }
  ]
};

export const fallbackReportsData: ReportsPageData = {
  exports: [
    {
      report: "Monthly Donor Summary",
      format: "CSV",
      generatedAt: "2026-05-04 09:10",
      owner: "Admin Team",
      status: "Ready"
    },
    {
      report: "Module Completion Detail",
      format: "PDF",
      generatedAt: "2026-05-04 09:40",
      owner: "Program Ops",
      status: "Queued"
    }
  ]
};
