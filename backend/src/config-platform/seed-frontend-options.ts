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
  // option_set entries live in the "options" namespace; ui_copy entries (email
  // subject/body templates etc.) live in "content". Defaults to option_set.
  type?: "option_set" | "ui_copy";
  payload: { title: string; items: OptionItem[] } | Record<string, unknown>;
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
          metadata: {
            description: "Impact metrics, completion funnel, reward totals.",
            // Which export-service dataset this preset generates (CS-6).
            reportType: "donor_summary"
          }
        },
        {
          id: "ops",
          value: "ops",
          label: "Ops",
          enabled: true,
          sortOrder: 2,
          metadata: {
            description: "Daily completion deltas, drop-off list, exceptions.",
            reportType: "module_completion_detail"
          }
        },
        {
          id: "finance",
          value: "finance",
          label: "Finance",
          enabled: true,
          sortOrder: 3,
          metadata: {
            description: "Reward issuance ledger and reconciliations.",
            reportType: "rewards_issuance_log"
          }
        }
      ]
    }
  },
  {
    key: "bot.states_full",
    title: "All Nigerian states (full list)",
    payload: {
      title: "All Nigerian states (full list)",
      // Shown page-by-page after the learner taps "Others" on the state
      // question, so nobody types their state by hand. The handler carries the
      // same complete list as its built-in fallback.
      items: [
        "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
        "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
        "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
        "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
        "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT (Abuja)"
      ].map((label, index) => ({
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        value: label,
        label,
        enabled: true,
        sortOrder: index + 1,
        metadata: {}
      }))
    }
  },
  {
    key: "whatsapp.outreach_templates",
    title: "WhatsApp outreach templates",
    payload: {
      title: "WhatsApp outreach templates",
      items: [
        {
          id: "hello_world",
          value: "hello_world",
          label: "Hello (Meta sample template)",
          enabled: true,
          sortOrder: 1,
          metadata: {
            languageCode: "en_US",
            description:
              "Meta's pre-approved sample template, available on every WhatsApp Business account. Replace with your own approved outreach templates - the value must exactly match the template name in Meta Business Manager."
          }
        }
      ]
    }
  },
  {
    key: "reports.cadence_options",
    title: "Report schedule cadences",
    payload: {
      title: "Report schedule cadences",
      // metadata drives the scheduler's next-run computation. Times are stored
      // in UTC (hourUtc, weekdayUtc uses the JS convention 0=Sunday..6=Saturday,
      // dayOfMonthUtc is 1-based); labels show the operator's local WAT (UTC+1).
      items: [
        {
          id: "daily_0800utc",
          value: "daily_0800utc",
          label: "Daily at 09:00 (WAT)",
          enabled: true,
          sortOrder: 1,
          metadata: { kind: "daily", hourUtc: 8 }
        },
        {
          id: "weekly_mon_0800utc",
          value: "weekly_mon_0800utc",
          label: "Weekly on Mondays at 09:00 (WAT)",
          enabled: true,
          sortOrder: 2,
          metadata: { kind: "weekly", weekdayUtc: 1, hourUtc: 8 }
        },
        {
          id: "monthly_1st_0800utc",
          value: "monthly_1st_0800utc",
          label: "Monthly on the 1st at 09:00 (WAT)",
          enabled: true,
          sortOrder: 3,
          metadata: { kind: "monthly", dayOfMonthUtc: 1, hourUtc: 8 }
        }
      ]
    }
  },
  {
    key: "reports.recipient_directory",
    title: "Report recipient directory",
    payload: {
      title: "Report recipient directory",
      // External stakeholders who may receive scheduled reports but have no
      // dashboard login. value = the email address; label = who it reaches.
      // Compliance-sensitive by design: managed through the config platform so
      // every change to who receives beneficiary data is versioned + attributed.
      items: [
        {
          id: "sample_partner_contact",
          value: "reports@example.org",
          label: "Sample partner contact (replace me)",
          enabled: false,
          sortOrder: 1,
          metadata: {
            organisation: "Example Partner Org",
            description:
              "Placeholder entry shipped disabled so no real report can ever be mailed to it. Replace with your partner or finance contacts, then enable."
          }
        }
      ]
    }
  },
  {
    key: "reports.schedule.email_subject",
    title: "Scheduled report email subject",
    type: "ui_copy",
    payload: {
      en: "{{orgName}} scheduled report: {{reportLabel}} ({{period}})"
    }
  },
  {
    key: "reports.schedule.email_body",
    title: "Scheduled report email body",
    type: "ui_copy",
    payload: {
      en: [
        "Hello,",
        "",
        "Please find attached the scheduled {{reportLabel}} report from {{orgName}}, covering {{period}}.",
        "",
        "Attachment: {{fileName}}",
        "Cadence: {{cadenceLabel}}",
        "",
        "This report was generated and sent automatically. If you believe you received it in error, or no longer wish to receive it, reply to this email and the {{orgName}} team will update the recipient list.",
        "",
        "{{orgName}}"
      ].join("\n")
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

/** option_set documents live under /options, ui_copy under /content. */
function namespaceFor(entry: SeedEntry) {
  return (entry.type ?? "option_set") === "ui_copy" ? "content" : "options";
}

async function ensureDocument(baseUrl: string, token: string, entry: SeedEntry): Promise<DocumentEnvelope> {
  const encodedKey = encodeURIComponent(entry.key);
  const namespace = namespaceFor(entry);
  const existing = await requestJson<DocumentEnvelope | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/${namespace}/documents/${encodedKey}`
  );
  if (existing.status === 200 && existing.body && "document" in existing.body) {
    return existing.body;
  }
  if (existing.status !== 404 && existing.status !== 409) {
    throw new Error(`Unable to fetch existing document for ${entry.key} (status ${existing.status})`);
  }

  const created = await requestJson<
    { document: { id: string; key: string; type: string }; draft: { id: string } } | { message?: string }
  >(baseUrl, token, `/api/config/admin/${namespace}/documents`, {
    method: "POST",
    body: JSON.stringify({ key: entry.key, type: entry.type ?? "option_set", title: entry.title, initialPayload: entry.payload })
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
  const namespace = namespaceFor(entry);
  const expectedType = entry.type ?? "option_set";
  const ensured = await ensureDocument(baseUrl, token, entry);
  if (ensured.document.type !== expectedType) {
    throw new Error(`Seed key ${entry.key} already exists with type ${ensured.document.type}; expected ${expectedType}`);
  }

  const updated = await requestJson<{ draft: { id: string } } | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/${namespace}/documents/${encodedKey}/draft`,
    { method: "PUT", body: JSON.stringify({ payload: entry.payload, changeSummary: "Seed frontend option baseline" }) }
  );
  if (updated.status !== 200 || !updated.body || !("draft" in updated.body)) {
    throw new Error(`Failed to update draft for ${entry.key} (status ${updated.status})`);
  }

  const published = await requestJson<{ message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/${namespace}/documents/${encodedKey}/publish`,
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

  // SEED_ONLY_KEYS allows a targeted publish of just the named sets, so adding
  // a new option set later does not reset operator edits to the others.
  const onlyKeys = (process.env.SEED_ONLY_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const entries = onlyKeys.length
    ? SEED_ENTRIES.filter((entry) => onlyKeys.includes(entry.key))
    : SEED_ENTRIES;

  console.log(`Seeding ${entries.length} frontend option sets to ${baseUrl}`);
  for (const entry of entries) {
    await updateDraftAndPublish(baseUrl, token, entry);
    console.log(`Published: ${entry.key}`);
  }
  console.log("Frontend options seed completed.");
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
