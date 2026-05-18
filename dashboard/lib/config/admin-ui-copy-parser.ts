import type { PublicConfigDocument } from "./contracts";

export const ADMIN_UI_COPY_PREFIX = "admin.ui.";

type CopyMap = Record<string, string>;

function readFirstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstString(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferredOrder = ["en", "pcm", "ig"];
    for (const key of preferredOrder) {
      const found = readFirstString(obj[key]);
      if (found) return found;
    }
    for (const nested of Object.values(obj)) {
      const found = readFirstString(nested);
      if (found) return found;
    }
  }
  return null;
}

export function extractAdminUiCopyMap(documents: Array<PublicConfigDocument>): CopyMap {
  const map: CopyMap = {};

  for (const document of documents) {
    if (!document.key.startsWith(ADMIN_UI_COPY_PREFIX)) {
      continue;
    }
    const resolved = readFirstString(document.data);
    if (!resolved) {
      continue;
    }
    const key = document.key.slice(ADMIN_UI_COPY_PREFIX.length);
    map[key] = resolved;
  }

  return map;
}
