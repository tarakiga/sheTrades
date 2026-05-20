import type {
  AnalyticsPageData,
  ApiResult,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "./contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function fetchAdminData<T>(endpoint: string): Promise<ApiResult<T>> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request to ${endpoint} failed with status ${response.status}`);
  }
  const data = (await response.json()) as T;
  return { data, meta: { source: "live" } };
}

export function getUsersPageData() {
  return fetchAdminData<UsersPageData>("/api/admin/users");
}

export function getAnalyticsPageData() {
  return fetchAdminData<AnalyticsPageData>("/api/admin/analytics");
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
}

export function getRewardsPageData() {
  return fetchAdminData<RewardsPageData>("/api/admin/rewards");
}

export function getReportsPageData() {
  return fetchAdminData<ReportsPageData>("/api/admin/reports");
}
