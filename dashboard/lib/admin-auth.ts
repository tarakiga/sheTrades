export const ADMIN_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
export const ADMIN_AUTH_TOKEN_KEY = "admin_session_jwt";
export const ADMIN_CONFIG_TOKEN_KEY = "admin_config_jwt";
export const ADMIN_AUTH_TOKEN_UPDATED_EVENT = "admin-auth-token-updated";
export const ADMIN_CONFIG_TOKEN_UPDATED_EVENT = "admin-config-token-updated";

export type AdminSessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  avatarUrl?: string;
  lastLoginAt?: string | null;
};

function dispatchTokenEvents() {
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_TOKEN_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent(ADMIN_CONFIG_TOKEN_UPDATED_EVENT));
}

export function getStoredAdminAuthToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return (
    window.localStorage.getItem(ADMIN_AUTH_TOKEN_KEY) ??
    window.localStorage.getItem(ADMIN_CONFIG_TOKEN_KEY) ??
    ""
  );
}

export function saveStoredAdminAuthToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = token.trim();
  window.localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, trimmed);
  window.localStorage.setItem(ADMIN_CONFIG_TOKEN_KEY, trimmed);
  dispatchTokenEvents();
}

export function clearStoredAdminAuthToken() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_CONFIG_TOKEN_KEY);
  dispatchTokenEvents();
}

export async function fetchAdminAuthJson<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const accessToken = token ?? getStoredAdminAuthToken();
  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();
  const looksJson = contentType.toLowerCase().includes("application/json");
  const payload = looksJson && rawBody ? (JSON.parse(rawBody) as unknown) : rawBody;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>).message)
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (!looksJson) {
    throw new Error(`Expected JSON response but received ${contentType || "unknown content type"}.`);
  }

  return payload as T;
}
