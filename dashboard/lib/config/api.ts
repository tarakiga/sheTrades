import {
  parsePublicConfigBundle,
  type ConfigApiResult,
  type ConfigNamespace,
  type PublicConfigBundle
} from "./contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

/**
 * GAP-E2: the client used `cache: "no-store"` everywhere, so the backend's
 * ETag / Cache-Control headers were never honoured and every render re-fetched.
 * We now cache for a short window and tag the entries, so a publish can bust
 * them immediately with `revalidateTag("config")` (or the per-namespace tag)
 * instead of waiting for the window to lapse.
 */
const CONFIG_REVALIDATE_SECONDS = Number(
  process.env.NEXT_PUBLIC_CONFIG_REVALIDATE_SECONDS ?? "30"
);

export const CONFIG_CACHE_TAG = "config";

function emptyBundle(message: string): ConfigApiResult<PublicConfigBundle> {
  return {
    source: "empty",
    message,
    data: { versionTag: "empty", documents: [] }
  };
}

async function fetchPublicBundle(
  path: string,
  tags: string[]
): Promise<ConfigApiResult<PublicConfigBundle>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      next: {
        revalidate: Number.isFinite(CONFIG_REVALIDATE_SECONDS) ? CONFIG_REVALIDATE_SECONDS : 30,
        tags
      }
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    // GAP-E1: validate rather than cast. A malformed envelope falls back to
    // safe empty defaults; individual bad documents are dropped.
    const parsed = parsePublicConfigBundle(await response.json());
    if (!parsed) {
      return emptyBundle("Config bundle failed validation; rendering safe defaults.");
    }
    return { data: parsed, source: "live" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    return emptyBundle(`Unable to fetch config bundle: ${message}`);
  }
}

export function getPublicConfigBundle() {
  return fetchPublicBundle("/api/config/public/bundle", [CONFIG_CACHE_TAG]);
}

export function getPublicConfigNamespace(namespace: ConfigNamespace) {
  return fetchPublicBundle(`/api/config/public/${namespace}`, [
    CONFIG_CACHE_TAG,
    `${CONFIG_CACHE_TAG}:${namespace}`
  ]);
}
