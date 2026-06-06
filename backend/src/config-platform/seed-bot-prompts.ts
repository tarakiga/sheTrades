/**
 * Publishes an editable baseline of the bot conversation copy into the config
 * "content" namespace (keys `bot.prompt.<key>`, type ui_copy), sourced from
 * BOT_PROMPT_DEFAULTS so code + config never drift. After this runs, admins can
 * edit any bot prompt from the dashboard. The handler overlays these published
 * values over the in-code defaults at runtime.
 *
 * Usage (against a running backend):
 *   ADMIN_CONFIG_JWT_SECRET=... BOT_PROMPTS_SEED_BASE_URL=https://... \
 *     npm run seed:bot-prompts -w @shetrades/backend
 */
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import {
  BOT_PROMPT_DEFAULTS,
  BOT_PROMPT_CONFIG_PREFIX,
  BOT_PROMPT_TITLES
} from "../whatsapp/bot-prompts.js";

type Entry = {
  key: string;
  title: string;
  content: { en: string; pcm?: string; ig?: string };
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

function buildEntries(): Entry[] {
  const entries: Entry[] = [];
  for (const [key, value] of Object.entries(BOT_PROMPT_DEFAULTS)) {
    // Skip empty defaults (e.g. an unused footer) — the config layer requires a
    // non-empty `en`, and there is nothing meaningful to seed.
    if (!value.en || value.en.trim().length === 0) continue;
    entries.push({
      key: `${BOT_PROMPT_CONFIG_PREFIX}${key}`,
      title: BOT_PROMPT_TITLES[key] ?? `Bot · ${key}`,
      content: {
        en: value.en,
        ...(value.pcm ? { pcm: value.pcm } : {}),
        ...(value.ig ? { ig: value.ig } : {})
      }
    });
  }
  return entries;
}

function buildAuthToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    { sub: process.env.BOT_PROMPTS_SEED_SUBJECT ?? "seed-bot-prompts", role: "admin", iat: now, exp: now + 60 * 20 },
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

async function ensureDocument(baseUrl: string, token: string, entry: Entry): Promise<DocumentEnvelope> {
  const encodedKey = encodeURIComponent(entry.key);
  const existing = await requestJson<DocumentEnvelope | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}`
  );
  if (existing.status === 200 && existing.body && "document" in existing.body) {
    return existing.body;
  }
  if (existing.status !== 404 && existing.status !== 409) {
    throw new Error(`Unable to fetch existing document for ${entry.key} (status ${existing.status})`);
  }

  const created = await requestJson<
    { document: { id: string; key: string; type: string }; draft: { id: string } } | { message?: string }
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
        : `status ${created.status}`;
    throw new Error(`Failed to create document for ${entry.key}: ${message}`);
  }
  return { document: created.body.document, draft: created.body.draft };
}

async function updateDraftAndPublish(baseUrl: string, token: string, entry: Entry) {
  const encodedKey = encodeURIComponent(entry.key);
  const ensured = await ensureDocument(baseUrl, token, entry);
  if (ensured.document.type !== "ui_copy") {
    throw new Error(`Seed key ${entry.key} already exists with type ${ensured.document.type}; expected ui_copy`);
  }

  const updated = await requestJson<{ draft: { id: string } } | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}/draft`,
    {
      method: "PUT",
      body: JSON.stringify({ payload: entry.content, changeSummary: "Seed bot prompt baseline" })
    }
  );
  if (updated.status !== 200 || !updated.body || !("draft" in updated.body)) {
    throw new Error(`Failed to update draft for ${entry.key} (status ${updated.status})`);
  }

  const published = await requestJson<{ message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}/publish`,
    {
      method: "POST",
      body: JSON.stringify({ expectedDraftVersionId: updated.body.draft.id, publishNote: "Seed bot prompt baseline" })
    }
  );
  if (published.status !== 200) {
    throw new Error(`Failed to publish ${entry.key} (status ${published.status})`);
  }
}

async function main() {
  const baseUrl = getEnv("BOT_PROMPTS_SEED_BASE_URL", "http://localhost:8080");
  const secret = getEnv("ADMIN_CONFIG_JWT_SECRET");
  const entries = buildEntries();
  const token = buildAuthToken(secret);

  console.log(`Seeding ${entries.length} bot prompts to ${baseUrl}`);
  for (const entry of entries) {
    await updateDraftAndPublish(baseUrl, token, entry);
    console.log(`Published: ${entry.key}`);
  }
  console.log("Bot prompt seed completed.");
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
