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
    users: []
  };
  return fetchWithFallback<UsersPageData>("/api/admin/users", fallback);
}

export function getAnalyticsPageData() {
  const fallback: AnalyticsPageData = {
    registrationRate: "0%",
    completionRate: "0%",
    passRate: "0%",
    funnelOverall: "No published analytics funnel configuration available.",
    funnelAnambra: "No state analytics available.",
    funnelDelta: "No state analytics available."
  };
  return fetchWithFallback<AnalyticsPageData>("/api/admin/analytics", fallback);
}

type PublicConfigDocument = {
  namespace: string;
  key: string;
  versionTag: string;
  data: Record<string, unknown>;
  updatedAt: string;
};

type PublicConfigBundle = {
  versionTag: string;
  documents: Array<PublicConfigDocument>;
};

function toSafeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export async function getContentPageData() {
  const fallback: ContentPageData = { lessons: [] };
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/public/content`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const bundle = (await response.json()) as PublicConfigBundle;
    const lessons = bundle.documents.map((document) => {
      const moduleValue = toSafeString(
        document.data.module,
        toSafeString(document.key.split(".")[1], "Unassigned Module")
      );
      const lessonValue = toSafeString(document.data.title, document.key);
      const languageValue = toSafeString(document.data.language, "Dynamic");
      const quizValue = toSafeString(document.data.quiz, "Managed via config");
      return {
        module: moduleValue,
        lesson: lessonValue,
        language: languageValue,
        quiz: quizValue,
        status: "Published" as const
      };
    });
    return {
      data: { lessons },
      meta: { source: "live" as const }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    return {
      data: fallback,
      meta: { source: "fallback", message: `Using safe empty content config: ${message}` }
    };
  }
}

export function getRewardsPageData() {
  const fallback: RewardsPageData = {
    rewards: []
  };
  return fetchWithFallback<RewardsPageData>("/api/admin/rewards", fallback);
}

export function getReportsPageData() {
  const fallback: ReportsPageData = {
    exports: []
  };
  return fetchWithFallback<ReportsPageData>("/api/admin/reports", fallback);
}
