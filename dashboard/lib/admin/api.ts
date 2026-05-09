import type {
  AnalyticsPageData,
  ApiResult,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "./contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function fetchWithFallback<T>(endpoint: string, fallbackData: T): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = (await response.json()) as T;
    return { data, meta: { source: "live" } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    return {
      data: fallbackData,
      meta: { source: "fallback", message: `Using fallback data: ${message}` }
    };
  }
}

export function getUsersPageData() {
  const fallback: UsersPageData = {
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
  return fetchWithFallback<UsersPageData>("/api/admin/users", fallback);
}

export function getAnalyticsPageData() {
  const fallback: AnalyticsPageData = {
    registrationRate: "72.4%",
    completionRate: "34.8%",
    passRate: "63.1%",
    funnelOverall:
      "Onboarding 20,412 -> Language Set 18,920 -> Module Start 13,907 -> Quiz Attempt 8,112 -> Complete 7,104",
    funnelAnambra: "Completion 37.2% | Pass 64.8%",
    funnelDelta: "Completion 31.5% | Pass 61.3%"
  };
  return fetchWithFallback<AnalyticsPageData>("/api/admin/analytics", fallback);
}

export function getContentPageData() {
  const fallback: ContentPageData = {
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
  return fetchWithFallback<ContentPageData>("/api/admin/content", fallback);
}

export function getRewardsPageData() {
  const fallback: RewardsPageData = {
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
  return fetchWithFallback<RewardsPageData>("/api/admin/rewards", fallback);
}

export function getReportsPageData() {
  const fallback: ReportsPageData = {
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
  return fetchWithFallback<ReportsPageData>("/api/admin/reports", fallback);
}
