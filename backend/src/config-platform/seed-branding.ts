/**
 * Publishes the white-label branding baseline into the config "content"
 * namespace, so a partner organisation can rename and re-theme the product with
 * no deploy. The dashboard reads `branding.identity` to set the organisation
 * name and inject colour/font CSS variables; the backend reads it for emails and
 * the bot welcome. `admin.invite.login_url` pins the exact login link used in
 * team-invite emails.
 *
 * Usage (against a running backend):
 *   ADMIN_CONFIG_JWT_SECRET=... BRANDING_SEED_BASE_URL=https://... \
 *     npm run seed:branding -w @shetrades/backend
 */
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

type SeedEntry = {
  key: string;
  title: string;
  payload: Record<string, unknown>;
};

const SEED_ENTRIES: SeedEntry[] = [
  {
    key: "branding.identity",
    title: "Branding",
    payload: {
      organisationName: "SheTrades",
      primaryColor: "#334e58",
      secondaryColor: "#ffbe22",
      accentColor: "#f0a90e",
      fontFamily: "Inter"
    }
  },
  {
    key: "admin.invite.login_url",
    title: "Admin invite login URL",
    payload: {
      en: process.env.BRANDING_SEED_LOGIN_URL ?? "https://she-trades.vercel.app/login"
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
    {
      sub: process.env.BRANDING_SEED_SUBJECT ?? "seed-branding",
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
    body: JSON.stringify({ key: entry.key, type: "ui_copy", title: entry.title, initialPayload: entry.payload })
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
  await ensureDocument(baseUrl, token, entry);

  const updated = await requestJson<{ draft: { id: string } } | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}/draft`,
    { method: "PUT", body: JSON.stringify({ payload: entry.payload, changeSummary: "Seed branding baseline" }) }
  );
  if (updated.status !== 200 || !updated.body || !("draft" in updated.body)) {
    throw new Error(`Failed to update draft for ${entry.key} (status ${updated.status})`);
  }

  const published = await requestJson<{ message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/content/documents/${encodedKey}/publish`,
    { method: "POST", body: JSON.stringify({ expectedDraftVersionId: updated.body.draft.id, publishNote: "Seed branding baseline" }) }
  );
  if (published.status !== 200) {
    throw new Error(`Failed to publish ${entry.key} (status ${published.status})`);
  }
}

async function main() {
  const baseUrl = getEnv("BRANDING_SEED_BASE_URL", "http://localhost:8080");
  const secret = getEnv("ADMIN_CONFIG_JWT_SECRET");
  const token = buildAuthToken(secret);

  console.log(`Seeding ${SEED_ENTRIES.length} branding documents to ${baseUrl}`);
  for (const entry of SEED_ENTRIES) {
    await updateDraftAndPublish(baseUrl, token, entry);
    console.log(`Published: ${entry.key}`);
  }
  console.log("Branding seed completed.");
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
