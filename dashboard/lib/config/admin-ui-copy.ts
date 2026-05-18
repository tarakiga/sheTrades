import { cache } from "react";
import { getPublicConfigNamespace } from "./api";
import { extractAdminUiCopyMap } from "./admin-ui-copy-parser";

export const getAdminUiCopy = cache(async () => {
  const result = await getPublicConfigNamespace("content");
  const map = extractAdminUiCopyMap(result.data.documents);

  return {
    map,
    source: result.source,
    message: result.message,
    versionTag: result.data.versionTag,
    t(key: string, fallback: string) {
      const value = map[key];
      return typeof value === "string" && value.trim().length > 0 ? value : fallback;
    }
  };
});
