import type {
  AnalyticsPageData,
  ApiResult,
  ContentPageData,
  HelpRequestsData,
  LearnerDetail,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "./contracts";
import { getStoredAdminAuthToken } from "../admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

// Attach the stored admin JWT so /api/admin/* calls authenticate. Runs
// client-side only (getStoredAdminAuthToken returns "" during SSR), which is
// why the pages that consume these helpers are client components.
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getStoredAdminAuthToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function fetchWithFallback<T>(endpoint: string, fallbackData: T): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      cache: "no-store",
      headers: authHeaders()
    });
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

export function getHelpRequests(limit = 5) {
  const fallback: HelpRequestsData = { requests: [] };
  return fetchWithFallback<HelpRequestsData>(
    `/api/admin/users/help-requests?limit=${encodeURIComponent(String(limit))}`,
    fallback
  );
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
    stateFunnels: []
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

export type RewardsListParams = {
  status?: "Issued" | "Pending" | "Failed";
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

function buildRewardsQuery(params: RewardsListParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

export function getRewardsPageData(params: RewardsListParams = {}) {
  const fallback: RewardsPageData = {
    rewards: [],
    meta: { activeProvider: null, nextCursor: null }
  };
  const queryString = buildRewardsQuery(params);
  const endpoint = `/api/admin/rewards${queryString ? `?${queryString}` : ""}`;
  return fetchWithFallback<RewardsPageData>(endpoint, fallback);
}

async function rewardsActionFetch<T>(
  endpoint: string,
  init: RequestInit,
  errorPrefix: string
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    credentials: "include",
    ...init,
    headers: authHeaders(init.headers as Record<string, string> | undefined)
  });
  if (!response.ok) {
    let message = `${errorPrefix} (HTTP ${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body && typeof body.message === "string" && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // ignore JSON parse failure; keep the default message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function retryReward(id: string) {
  return rewardsActionFetch<{ message: string }>(
    `/api/admin/rewards/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
    "Retry failed"
  );
}

export function markRewardIssued(
  id: string,
  body: { note: string; providerTxnId?: string }
) {
  return rewardsActionFetch<{ message: string }>(
    `/api/admin/rewards/${encodeURIComponent(id)}/mark-issued`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    "Mark issued failed"
  );
}

export function createManualReward(body: {
  phone: string;
  amount: number;
  channel: string;
  note: string;
}) {
  return rewardsActionFetch<{ id: string }>(
    `/api/admin/rewards/manual`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    "Manual create failed"
  );
}

export function rewardsExportEndpoint(params: RewardsListParams): string {
  const queryString = buildRewardsQuery(params);
  return `/api/admin/rewards/export${queryString ? `?${queryString}` : ""}`;
}

/**
 * Download a CSV from an authenticated admin endpoint. A plain
 * window.location.href navigation cannot carry the Authorization header, so we
 * fetch with the token and trigger a Blob download instead.
 */
export async function downloadAdminCsv(endpoint: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Export failed (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getReportsPageData() {
  const fallback: ReportsPageData = {
    exports: []
  };
  return fetchWithFallback<ReportsPageData>("/api/admin/reports", fallback);
}

export function getLearnerDetail(phone: string) {
  return fetchWithFallback<LearnerDetail | null>(
    `/api/admin/users/${encodeURIComponent(phone)}`,
    null
  );
}

export function flagLearner(phone: string, body: { flagged: boolean; note?: string }) {
  return rewardsActionFetch<{ message: string }>(
    `/api/admin/users/${encodeURIComponent(phone)}/flag`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    "Flag learner failed"
  );
}

export function usersExportEndpoint(): string {
  return `/api/admin/users/export`;
}

export function analyticsExportEndpoint(): string {
  return `/api/admin/analytics/export`;
}
