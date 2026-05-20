import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigPlatformService } from "./service.js";

type Actor = {
  id: string;
  role: "admin" | "editor" | "viewer";
};

type CategorySeedEntry = {
  key: string;
  title: string;
  items: Array<{
    value: string;
    label: string;
  }>;
};

function getSeedPath() {
  const configured = process.env.SETTINGS_CATEGORY_SEED_FILE;
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "docs",
    "config-seeds",
    "settings-category-option-sets.seed.json"
  );
}

async function loadSeedEntries(seedPath: string) {
  const raw = await readFile(seedPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Seed file must contain an array: ${seedPath}`);
  }

  return parsed.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Invalid category seed row at index ${index}`);
    }

    const key = String((row as Record<string, unknown>).key ?? "").trim();
    const title = String((row as Record<string, unknown>).title ?? "").trim();
    const itemsRaw = (row as Record<string, unknown>).items;

    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
      throw new Error(`Category seed row at index ${index} must include at least one item`);
    }

    const items = itemsRaw.map((item, itemIndex) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Invalid category seed item at index ${index}:${itemIndex}`);
      }

      const value = String((item as Record<string, unknown>).value ?? "")
        .trim()
        .toLowerCase();
      const label = String((item as Record<string, unknown>).label ?? "").trim();

      if (!value || !label) {
        throw new Error(
          `Category seed item at index ${index}:${itemIndex} must include value and label`
        );
      }

      return { value, label };
    });

    if (!key || !title) {
      throw new Error(`Category seed row at index ${index} must include key and title`);
    }

    return { key, title, items } satisfies CategorySeedEntry;
  });
}

function buildPayload(entry: CategorySeedEntry) {
  return {
    title: entry.title,
    items: entry.items.map((item, index) => ({
      id: randomUUID(),
      value: item.value,
      label: item.label,
      enabled: true,
      sortOrder: index + 1,
      metadata: {}
    }))
  };
}

export async function ensureCategoryOptionSetSeeds(actor: Actor) {
  const service = getConfigPlatformService();
  const seedPath = getSeedPath();
  const entries = await loadSeedEntries(seedPath);
  const createdKeys: string[] = [];
  const existingKeys: string[] = [];

  for (const entry of entries) {
    try {
      service.getDocumentByNamespaceKey("options", entry.key);
      existingKeys.push(entry.key);
      continue;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== "Config document not found.") {
        throw error;
      }
    }

    const created = service.createDocument(actor, {
      namespace: "options",
      key: entry.key,
      type: "option_set",
      title: entry.title,
      initialPayload: buildPayload(entry)
    });

    service.publishDocument(actor, created.document.id, {
      expectedDraftVersionId: created.draft.id,
      publishNote: "Seed default settings categories"
    });

    createdKeys.push(entry.key);
  }

  return {
    seedPath,
    createdKeys,
    existingKeys
  };
}
