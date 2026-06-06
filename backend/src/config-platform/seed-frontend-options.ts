/**
 * Publishes editable baselines for the dashboard's frontend option sets into
 * the config "options" namespace (type option_set), so they're admin-editable
 * with no deploy. The frontend reads these via fetchPublicOptionSet(), falling
 * back to its in-code defaults when nothing is published.
 *
 * Usage (against a running backend):
 *   ADMIN_CONFIG_JWT_SECRET=... FRONTEND_OPTIONS_SEED_BASE_URL=https://... \
 *     npm run seed:frontend-options -w @shetrades/backend
 */
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

type OptionItem = {
  id: string;
  value: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

type SeedEntry = {
  key: string;
  title: string;
  payload: { title: string; items: OptionItem[] };
};

const SEED_ENTRIES: SeedEntry[] = [
  {
    key: "rewards.status_options",
    title: "Rewards status filters",
    payload: {
      title: "Rewards status filters",
      items: [
        { id: "all", value: "All", label: "All", enabled: true, sortOrder: 1, metadata: {} },
        { id: "issued", value: "Issued", label: "Issued", enabled: true, sortOrder: 2, metadata: {} },
        { id: "pending", value: "Pending", label: "Pending", enabled: true, sortOrder: 3, metadata: {} },
        { id: "failed", value: "Failed", label: "Failed", enabled: true, sortOrder: 4, metadata: {} }
      ]
    }
  },
  {
    key: "rewards.date_range_options",
    title: "Rewards date ranges",
    payload: {
      title: "Rewards date ranges",
      items: [
        { id: "24h", value: "24h", label: "Last 24 hours", enabled: true, sortOrder: 1, metadata: {} },
        { id: "7d", value: "7d", label: "Last 7 days", enabled: true, sortOrder: 2, metadata: {} },
        { id: "30d", value: "30d", label: "Last 30 days", enabled: true, sortOrder: 3, metadata: {} },
        { id: "custom", value: "custom", label: "Custom…", enabled: true, sortOrder: 4, metadata: {} }
      ]
    }
  },
  {
    key: "reports.presets",
    title: "Report presets",
    payload: {
      title: "Report presets",
      items: [
        {
          id: "donor",
          value: "donor",
          label: "Donor",
          enabled: true,
          sortOrder: 1,
          metadata: { description: "Impact metrics, completion funnel, reward totals." }
        },
        {
          id: "ops",
          value: "ops",
          label: "Ops",
          enabled: true,
          sortOrder: 2,
          metadata: { description: "Daily completion deltas, drop-off list, exceptions." }
        },
        {
          id: "finance",
          value: "finance",
          label: "Finance",
          enabled: true,
          sortOrder: 3,
          metadata: { description: "Reward issuance ledger and reconciliations." }
        }
      ]
    }
  }
];

type DocumentEnvelope = {
  document: { id: string; key: string; type: string };
  draft: { id: string } | null;
};

function getEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildAuthToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    { sub: process.env.FRONTEND_OPTIONS_SEED_SUBJECT ?? "seed-frontend-options", role: "admin", iat: now, exp: now + 60 * 20 },
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
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : null;
  return { status: response.status, body };
}

async function ensureDocument(baseUrl: string, token: string, entry: SeedEntry): Promise<DocumentEnvelope> {
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
    throw new Error(`Unable to fetch existing document for ${entry.key} (status ${existing.status})`);
  }

  const created = await requestJson<
    { document: { id: string; key: string; type: string }; draft: { id: string } } | { message?: string }
  >(baseUrl, token, "/api/config/admin/options/documents", {
    method: "POST",
    body: JSON.stringify({ key: entry.key, type: "option_set", title: entry.title, initialPayload: entry.payload })
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

async function updateDraftAndPublish(baseUrl: string, token: string, entry: SeedEntry) {
  const encodedKey = encodeURIComponent(entry.key);
  const ensured = await ensureDocument(baseUrl, token, entry);
  if (ensured.document.type !== "option_set") {
    throw new Error(`Seed key ${entry.key} already exists with type ${ensured.document.type}; expected option_set`);
  }

  const updated = await requestJson<{ draft: { id: string } } | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/options/documents/${encodedKey}/draft`,
    { method: "PUT", body: JSON.stringify({ payload: entry.payload, changeSummary: "Seed frontend option baseline" }) }
  );
  if (updated.status !== 200 || !updated.body || !("draft" in updated.body)) {
    throw new Error(`Failed to update draft for ${entry.key} (status ${updated.status})`);
  }

  const published = await requestJson<{ message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/options/documents/${encodedKey}/publish`,
    { method: "POST", body: JSON.stringify({ expectedDraftVersionId: updated.body.draft.id, publishNote: "Seed frontend option baseline" }) }
  );
  if (published.status !== 200) {
    throw new Error(`Failed to publish ${entry.key} (status ${published.status})`);
  }
}

async function main() {
  const baseUrl = getEnv("FRONTEND_OPTIONS_SEED_BASE_URL", "http://localhost:8080");
  const secret = getEnv("ADMIN_CONFIG_JWT_SECRET");
  const token = buildAuthToken(secret);

  console.log(`Seeding ${SEED_ENTRIES.length} frontend option sets to ${baseUrl}`);
  for (const entry of SEED_ENTRIES) {
    await updateDraftAndPublish(baseUrl, token, entry);
    console.log(`Published: ${entry.key}`);
  }
  console.log("Frontend options seed completed.");
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
