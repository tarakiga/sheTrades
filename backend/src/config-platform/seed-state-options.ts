import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

type StateOptionItem = {
  id: string;
  value: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

type StateOptionsPayload = {
  title: string;
  items: StateOptionItem[];
};

type SeedEntry = {
  key: string;
  title: string;
  type: string;
  payload: StateOptionsPayload;
};

type DocumentEnvelope = {
  document: { id: string; key: string; type: string };
  draft: { id: string } | null;
};

const SEED_ENTRY: SeedEntry = {
  key: "bot.state_options",
  title: "States",
  type: "option_set",
  payload: {
    title: "States",
    items: [
      { id: "anambra", value: "Anambra", label: "Anambra", enabled: true, sortOrder: 1, metadata: {} },
      { id: "delta",   value: "Delta",   label: "Delta",   enabled: true, sortOrder: 2, metadata: {} }
    ]
  }
};

function getEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildAuthToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const subject = process.env.STATE_OPTIONS_SEED_SUBJECT ?? "seed-state-options";
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
    `/api/config/admin/options/documents/${encodedKey}`
  );
  if (existing.status === 200 && existing.body && "document" in existing.body) {
    return existing.body;
  }

  if (existing.status !== 404 && existing.status !== 409) {
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
  >(baseUrl, token, "/api/config/admin/options/documents", {
    method: "POST",
    body: JSON.stringify({
      key: entry.key,
      type: entry.type,
      title: entry.title,
      initialPayload: entry.payload
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
  if (ensured.document.type !== entry.type) {
    throw new Error(
      `Seed key ${entry.key} already exists with type ${ensured.document.type}; expected ${entry.type}`
    );
  }

  const updated = await requestJson<{ draft: { id: string } } | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/options/documents/${encodedKey}/draft`,
    {
      method: "PUT",
      body: JSON.stringify({
        payload: entry.payload,
        changeSummary: "Seed bot.state_options baseline"
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
    `/api/config/admin/options/documents/${encodedKey}/publish`,
    {
      method: "POST",
      body: JSON.stringify({
        expectedDraftVersionId: updated.body.draft.id,
        publishNote: "Seed bot.state_options baseline"
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
  if (!process.env.POSTGRES_URL) {
    console.log("POSTGRES_URL not set; skipping seed:state-options.");
    return;
  }

  const baseUrl = getEnv("STATE_OPTIONS_SEED_BASE_URL", "http://localhost:8080");
  const secret = getEnv("ADMIN_CONFIG_JWT_SECRET");
  const token = buildAuthToken(secret);

  console.log(`Seeding bot.state_options (namespace: options, type: option_set)`);
  await updateDraftAndPublish(baseUrl, token, SEED_ENTRY);
  console.log(`Published: ${SEED_ENTRY.key}`);
  console.log("State options seed completed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exitCode = 1;
});
