import type { ConfigApiResult, ConfigNamespace, PublicConfigBundle } from "./contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function fetchPublicBundle(path: string): Promise<ConfigApiResult<PublicConfigBundle>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = (await response.json()) as PublicConfigBundle;
    return { data, source: "live" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    return {
      source: "empty",
      message: `Unable to fetch config bundle: ${message}`,
      data: {
        versionTag: "empty",
        documents: []
      }
    };
  }
}

export function getPublicConfigBundle() {
  return fetchPublicBundle("/api/config/public/bundle");
}

export function getPublicConfigNamespace(namespace: ConfigNamespace) {
  return fetchPublicBundle(`/api/config/public/${namespace}`);
}
