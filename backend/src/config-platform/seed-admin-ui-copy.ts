import { readFile } from "node:fs/promises";
import path from "node:path";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

type SeedEntry = {
  key: string;
  title: string;
  content: {
    en: string;
    pcm?: string | undefined;
    ig?: string | undefined;
  };
};

type DocumentEnvelope = {
  document: { id: string; key: string; type: string };
  draft: { id: string } | null;
};

function getEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSeedPath() {
  const configured = process.env.ADMIN_UI_COPY_SEED_FILE;
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), "..", "docs", "config-seeds", "admin-ui-copy.seed.json");
}

async function loadSeedEntries(seedPath: string) {
  const raw = await readFile(seedPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Seed file must contain an array: ${seedPath}`);
  }
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Invalid seed row at index ${index}`);
    }
    const key = String((row as Record<string, unknown>).key ?? "").trim();
    const title = String((row as Record<string, unknown>).title ?? "").trim();
    const contentRaw = (row as Record<string, unknown>).content;
    const legacyValue = String((row as Record<string, unknown>).value ?? "").trim();
    const content = {
      en:
        contentRaw && typeof contentRaw === "object"
          ? String((contentRaw as Record<string, unknown>).en ?? "").trim()
          : legacyValue,
      ...(contentRaw && typeof contentRaw === "object"
        ? {
            ...(String((contentRaw as Record<string, unknown>).pcm ?? "").trim()
              ? { pcm: String((contentRaw as Record<string, unknown>).pcm ?? "").trim() }
              : {}),
            ...(String((contentRaw as Record<string, unknown>).ig ?? "").trim()
              ? { ig: String((contentRaw as Record<string, unknown>).ig ?? "").trim() }
              : {})
          }
        : {})
    };
    if (!key || !title || !content.en) {
      throw new Error(`Seed row at index ${index} must include key/title/content.en`);
    }
    return { key, title, content } satisfies SeedEntry;
  });
}

function buildAuthToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const subject = process.env.ADMIN_UI_COPY_SEED_SUBJECT ?? "seed-admin-ui-copy";
  return signJwtHs256ForTests(
    {
      sub: subject,
      role: "admin",
      iat: now,
      exp: now + 60 * 20
    },
    secret
  );
}

async function requestJson<T>(
  baseUrl: string,
  token: string,
  input: string,
  init?: RequestInit
): Promise<{ status: number; body: T | null }> {
  const response = await fetch(`${baseUrl}${input}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : null;
  return { status: response.status, body };
}

async function ensureDocument(
  baseUrl: string,
  token: string,
  entry: SeedEntry
): Promise<DocumentEnvelope> {
  const encodedKey = encodeURIComponent(entry.key);
  const existing = await requestJson<DocumentEnvelope | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}`
  );
  if (existing.status === 200 && existing.body && "document" in existing.body) {
    return existing.body;
  }

  if (existing.status !== 404) {
    const message =
      existing.body && typeof existing.body === "object" && "message" in existing.body
        ? String(existing.body.message)
        : "Unknown error";
    throw new Error(`Unable to fetch existing document for ${entry.key}: ${message}`);
  }

  const created = await requestJson<
    | {
        document: { id: string; key: string; type: string };
        draft: { id: string };
      }
    | { message?: string }
  >(baseUrl, token, "/api/config/admin/content/documents", {
    method: "POST",
    body: JSON.stringify({
      key: entry.key,
      type: "ui_copy",
      title: entry.title,
      initialPayload: entry.content
    })
  });

  if (created.status !== 201 || !created.body || !("document" in created.body)) {
    const message =
      created.body && typeof created.body === "object" && "message" in created.body
        ? String(created.body.message)
        : "Unknown error";
    throw new Error(`Failed to create document for ${entry.key}: ${message}`);
  }

  return {
    document: created.body.document,
    draft: created.body.draft
  };
}

async function updateDraftAndPublish(baseUrl: string, token: string, entry: SeedEntry) {
  const encodedKey = encodeURIComponent(entry.key);
  const ensured = await ensureDocument(baseUrl, token, entry);
  if (ensured.document.type !== "ui_copy") {
    throw new Error(
      `Seed key ${entry.key} already exists with type ${ensured.document.type}; expected ui_copy`
    );
  }

  const updated = await requestJson<{ draft: { id: string } } | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}/draft`,
    {
      method: "PUT",
      body: JSON.stringify({
        payload: entry.content,
        changeSummary: "Seed admin UI copy baseline"
      })
    }
  );

  if (updated.status !== 200 || !updated.body || !("draft" in updated.body)) {
    const message =
      updated.body && typeof updated.body === "object" && "message" in updated.body
        ? String(updated.body.message)
        : "Unknown error";
    throw new Error(`Failed to update draft for ${entry.key}: ${message}`);
  }

  const published = await requestJson<{ message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}/publish`,
    {
      method: "POST",
      body: JSON.stringify({
        expectedDraftVersionId: updated.body.draft.id,
        publishNote: "Seed admin UI copy baseline"
      })
    }
  );

  if (published.status !== 200) {
    const message =
      published.body && typeof published.body === "object" && "message" in published.body
        ? String(published.body.message)
        : "Unknown error";
    throw new Error(`Failed to publish ${entry.key}: ${message}`);
  }
}

async function main() {
  const baseUrl = getEnv("ADMIN_UI_COPY_SEED_BASE_URL", "http://localhost:8080");
  const secret = getEnv("ADMIN_CONFIG_JWT_SECRET");
  const seedPath = getSeedPath();
  const entries = await loadSeedEntries(seedPath);
  const token = buildAuthToken(secret);

  console.log(`Seeding ${entries.length} admin UI copy entries from ${seedPath}`);
  for (const entry of entries) {
    await updateDraftAndPublish(baseUrl, token, entry);
    console.log(`Published: ${entry.key}`);
  }
  console.log("Admin UI copy seed completed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exitCode = 1;
});
