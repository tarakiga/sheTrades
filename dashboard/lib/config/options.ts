import { getPublicConfigNamespace } from "./api";

export type ConfigOptionItem = {
  value: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

function parseItems(data: Record<string, unknown>): ConfigOptionItem[] {
  const items = data.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((raw): ConfigOptionItem | null => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      if (typeof row.value !== "string" || typeof row.label !== "string") return null;
      return {
        value: row.value,
        label: row.label,
        enabled: row.enabled !== false,
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {}
      };
    })
    .filter((item): item is ConfigOptionItem => item !== null)
    .filter((item) => item.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Fetch a published option set (options namespace) by key. Returns an empty
 * array when the doc is missing/unpublished so callers can fall back to their
 * in-code defaults (safe-default mandate).
 */
export async function fetchPublicOptionSet(key: string): Promise<ConfigOptionItem[]> {
  const result = await getPublicConfigNamespace("options");
  const doc = result.data.documents.find((document) => document.key === key);
  if (!doc) return [];
  return parseItems(doc.data);
}
