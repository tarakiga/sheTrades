/**
 * Publishes the privacy policy's editable baseline into the config "legal"
 * namespace (type legal_block), so the policy body, organisation name, contact
 * email, and effective date are all admin-editable under Settings → Legal with
 * no deploy. The public /privacy page reads these via getPublicConfigNamespace,
 * falling back to its in-code defaults when nothing is published.
 *
 * Usage (against a running backend):
 *   ADMIN_CONFIG_JWT_SECRET=... LEGAL_PRIVACY_SEED_BASE_URL=https://... \
 *     npm run seed:legal-privacy -w @shetrades/backend
 */
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

const CONTACT_EMAIL = "privacy@shetrades.digital";
// Effective date as an ISO datetime; the /privacy page formats it for display.
const EFFECTIVE_FROM = "2026-07-13T00:00:00.000Z";

// Sections mirror the /privacy page's built-in fallback. Joined into one body
// string (blank-line separated) so each heading/paragraph renders as its own
// block; an editor can freely rewrite this text once it is published.
const POLICY_SECTIONS: Array<{ heading: string; paragraphs: string[] }> = [
  {
    heading: "1. Introduction",
    paragraphs: [
      `{{orgName}} ("{{orgName}}", "we", "us") operates a digital literacy and business-skills learning service delivered over WhatsApp, together with an administrative platform used by our team to manage that service. This Privacy Policy explains what personal information we collect, how we use and share it, and the choices you have.`,
      "By messaging our WhatsApp number or using our service, you agree to the practices described in this policy."
    ]
  },
  {
    heading: "2. Information we collect",
    paragraphs: [
      "Information you provide: your WhatsApp phone number, the name you share with us, your preferred language, and your location or state where you choose to provide it.",
      "Information generated as you learn: the lessons and modules you start and complete, your quiz answers and scores, your progress over time, and messages you exchange with our automated assistant.",
      "Reward information: where you qualify for airtime or other rewards, we process the phone number and reward details needed to deliver them.",
      "Administrative accounts: for staff who use our admin platform, we process the account email, role, and activity needed to operate and secure the platform."
    ]
  },
  {
    heading: "3. How we use your information",
    paragraphs: [
      "To deliver lessons, quizzes, and messages to you over WhatsApp and track your learning progress.",
      "To calculate and issue rewards such as airtime top-ups where you are eligible.",
      "To understand how our content performs in aggregate and to improve lessons and the learner experience.",
      "To operate, secure, and troubleshoot the service, and to comply with our legal obligations."
    ]
  },
  {
    heading: "4. Messaging over WhatsApp",
    paragraphs: [
      "Our learning service is delivered through the WhatsApp Business Platform, which is provided by Meta. Your messages are transmitted through WhatsApp and are subject to WhatsApp's and Meta's own terms and privacy practices, which we do not control.",
      "We only send you service messages related to your participation in the programme. You can stop receiving them at any time (see 'Your rights and choices')."
    ]
  },
  {
    heading: "5. How we share information",
    paragraphs: [
      "Service providers: we use trusted providers to run the service - including messaging infrastructure (Meta / WhatsApp), cloud hosting, and airtime or mobile top-up partners - who process information only on our instructions.",
      "Legal and safety: we may disclose information where required by law, to enforce our terms, or to protect the rights, safety, and security of learners, our team, or the public.",
      "We do not sell your personal information."
    ]
  },
  {
    heading: "6. Data retention",
    paragraphs: [
      "We keep personal information for as long as needed to provide the service, calculate and deliver rewards, meet legal and reporting obligations, and resolve disputes. When it is no longer needed, we delete or anonymise it."
    ]
  },
  {
    heading: "7. How we protect your information",
    paragraphs: [
      "We use technical and organisational measures - including access controls, authentication for administrative accounts, and encryption in transit - to protect personal information. No method of transmission or storage is completely secure, but we work to protect your data and review our safeguards regularly."
    ]
  },
  {
    heading: "8. Your rights and choices",
    paragraphs: [
      "You may request access to, correction of, or deletion of your personal information, subject to applicable law.",
      "You can opt out of our WhatsApp messages at any time by replying to stop participating or by contacting us using the details below. Opting out will end your participation in the learning programme.",
      "To exercise any of these rights, contact us using the details in the 'Contact us' section."
    ]
  },
  {
    heading: "9. Children's privacy",
    paragraphs: [
      "Our service is intended for adults and is not directed to children. We do not knowingly collect personal information from children. If you believe a child has provided us information, please contact us so we can remove it."
    ]
  },
  {
    heading: "10. Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date above and, where appropriate, notify you through the service."
    ]
  },
  {
    heading: "11. Contact us",
    paragraphs: [
      `If you have questions about this policy or your personal information, contact {{orgName}} at {{contactEmail}}.`
    ]
  }
];

const POLICY_BODY = POLICY_SECTIONS.map(
  (section) => [section.heading, ...section.paragraphs].join("\n\n")
).join("\n\n");

type LegalPayload = {
  title: string;
  body: { en: string };
  complianceTag: string;
  effectiveFrom: string;
};

type SeedEntry = {
  key: string;
  title: string;
  payload: LegalPayload;
};

const SEED_ENTRIES: SeedEntry[] = [
  {
    key: "legal.privacy.policy",
    title: "Privacy policy - body",
    payload: {
      title: "Privacy Policy",
      body: { en: POLICY_BODY },
      complianceTag: "privacy-policy",
      effectiveFrom: EFFECTIVE_FROM
    }
  },
  {
    key: "legal.privacy.contact_email",
    title: "Privacy policy - contact email",
    payload: {
      title: "Privacy contact email",
      body: { en: CONTACT_EMAIL },
      complianceTag: "privacy-identity",
      effectiveFrom: EFFECTIVE_FROM
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
      sub: process.env.LEGAL_PRIVACY_SEED_SUBJECT ?? "seed-legal-privacy",
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
    `/api/config/admin/legal/documents/${encodedKey}`
  );
  if (existing.status === 200 && existing.body && "document" in existing.body) {
    return existing.body;
  }
  if (existing.status !== 404 && existing.status !== 409) {
    throw new Error(`Unable to fetch existing document for ${entry.key} (status ${existing.status})`);
  }

  const created = await requestJson<
    { document: { id: string; key: string; type: string }; draft: { id: string } } | { message?: string }
  >(baseUrl, token, "/api/config/admin/legal/documents", {
    method: "POST",
    body: JSON.stringify({ key: entry.key, type: "legal_block", title: entry.title, initialPayload: entry.payload })
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
  if (ensured.document.type !== "legal_block") {
    throw new Error(`Seed key ${entry.key} already exists with type ${ensured.document.type}; expected legal_block`);
  }

  const updated = await requestJson<{ draft: { id: string } } | { message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/legal/documents/${encodedKey}/draft`,
    { method: "PUT", body: JSON.stringify({ payload: entry.payload, changeSummary: "Seed privacy policy baseline" }) }
  );
  if (updated.status !== 200 || !updated.body || !("draft" in updated.body)) {
    throw new Error(`Failed to update draft for ${entry.key} (status ${updated.status})`);
  }

  const published = await requestJson<{ message?: string }>(
    baseUrl,
    token,
    `/api/config/admin/legal/documents/${encodedKey}/publish`,
    {
      method: "POST",
      body: JSON.stringify({ expectedDraftVersionId: updated.body.draft.id, publishNote: "Seed privacy policy baseline" })
    }
  );
  if (published.status !== 200) {
    throw new Error(`Failed to publish ${entry.key} (status ${published.status})`);
  }
}

async function main() {
  const baseUrl = getEnv("LEGAL_PRIVACY_SEED_BASE_URL", "http://localhost:8080");
  const secret = getEnv("ADMIN_CONFIG_JWT_SECRET");
  const token = buildAuthToken(secret);

  // SEED_ONLY_KEYS lets a targeted re-publish touch just one document (e.g. the
  // policy body) without resetting the others to their baseline.
  const onlyKeys = (process.env.SEED_ONLY_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const entries = onlyKeys.length
    ? SEED_ENTRIES.filter((entry) => onlyKeys.includes(entry.key))
    : SEED_ENTRIES;

  console.log(`Seeding ${entries.length} privacy legal blocks to ${baseUrl}`);
  for (const entry of entries) {
    await updateDraftAndPublish(baseUrl, token, entry);
    console.log(`Published: ${entry.key}`);
  }
  console.log("Privacy legal seed completed.");
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
