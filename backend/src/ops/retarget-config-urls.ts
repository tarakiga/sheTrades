/**
 * Rewrites a URL inside PUBLISHED config documents, through the normal
 * draft/publish path so the change carries an audit trail and can be rolled
 * back like any other edit.
 *
 * Why this exists: moving the console to its own hostname changes URLs that
 * live in config, not in code - the privacy notice the bot sends to every
 * participant, and the sign-in link in admin invite emails. Editing the in-code
 * defaults does nothing, because a published document wins at runtime. Doing it
 * by hand means retyping a 750-character notice in a textarea.
 *
 * Dry run by default. Nothing is written without --apply.
 *
 * Usage:
 *   ADMIN_CONFIG_JWT_SECRET=... CONFIG_BASE_URL=https://... \
 *     npm run ops:retarget-config-urls -w @shetrades/backend -- --group public-urls
 *   ...then the same with --apply once the report looks right.
 */
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

type Substitution = { from: string; to: string };

type Group = {
  description: string;
  namespace: string;
  substitutions: Substitution[];
};

/**
 * Two groups because they become correct at DIFFERENT moments.
 *
 * `public-urls` is safe whenever: www.shetrades.digital already served the
 * policy before the split and still does after it. `admin-host` must wait until
 * admin.shetrades.digital resolves, or invited operators get a dead link.
 */
const GROUPS: Record<string, Group> = {
  "public-urls": {
    description: "Point participant-facing links at the public host, not the Vercel hostname",
    namespace: "content",
    substitutions: [
      { from: "https://she-trades.vercel.app/privacy", to: "https://www.shetrades.digital/privacy" }
    ]
  },
  "admin-host": {
    description: "Point operator-facing links at the console host (run AFTER its DNS resolves)",
    namespace: "content",
    substitutions: [
      { from: "https://www.shetrades.digital/login", to: "https://admin.shetrades.digital/login" }
    ]
  }
};

type PublicDocument = { key: string; data: Record<string, unknown> };
type AdminDocument = {
  document: { key: string; type: string };
  draft: { id: string; payload: Record<string, unknown> } | null;
  published: { payload: Record<string, unknown> } | null;
};

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildAuthToken(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    {
      sub: process.env.CONFIG_OPS_SUBJECT ?? "ops-retarget-config-urls",
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
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: T | null }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as T) : null };
}

/**
 * Substitutes on the serialised payload so nested strings are covered without
 * walking the object. Safe only because the values are URLs: a `from` or `to`
 * containing a quote or a backslash would need JSON escaping to match, so those
 * are rejected up front rather than silently missing.
 */
function applySubstitutions(
  payload: Record<string, unknown>,
  substitutions: Substitution[]
): { payload: Record<string, unknown>; changed: boolean } {
  const before = JSON.stringify(payload);
  let after = before;
  for (const { from, to } of substitutions) {
    after = after.replaceAll(from, to);
  }
  return { payload: JSON.parse(after) as Record<string, unknown>, changed: after !== before };
}

function assertSubstitutable({ from, to }: Substitution): void {
  for (const value of [from, to]) {
    if (JSON.stringify(value) !== `"${value}"`) {
      throw new Error(`Substitution value needs JSON escaping and cannot be matched literally: ${value}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const force = args.includes("--force");
  const groupName = args[args.indexOf("--group") + 1];
  const group = groupName ? GROUPS[groupName] : undefined;

  if (!group) {
    console.error(`Usage: --group <${Object.keys(GROUPS).join("|")}> [--apply] [--force]`);
    for (const [name, entry] of Object.entries(GROUPS)) {
      console.error(`  ${name.padEnd(12)} ${entry.description}`);
    }
    process.exitCode = 1;
    return;
  }

  group.substitutions.forEach(assertSubstitutable);

  const baseUrl = requireEnv("CONFIG_BASE_URL", "http://localhost:8080").replace(/\/+$/, "");
  const token = buildAuthToken(requireEnv("ADMIN_CONFIG_JWT_SECRET"));

  console.log(`${apply ? "Applying" : "Dry run"}: ${group.description}`);
  console.log(`Target: ${baseUrl} (namespace "${group.namespace}")`);
  for (const { from, to } of group.substitutions) {
    console.log(`  ${from}\n    -> ${to}`);
  }

  const bundle = await requestJson<{ documents: PublicDocument[] }>(
    baseUrl,
    token,
    `/api/config/public/${group.namespace}`
  );
  if (bundle.status !== 200 || !bundle.body) {
    throw new Error(`Unable to read the published ${group.namespace} bundle (status ${bundle.status})`);
  }

  const affected = bundle.body.documents.filter(
    (doc) => applySubstitutions(doc.data ?? {}, group.substitutions).changed
  );

  if (affected.length === 0) {
    console.log("\nNothing to change - every published document already uses the new URL.");
    return;
  }

  console.log(`\n${affected.length} document(s) to update:`);
  let published = 0;
  let skipped = 0;

  for (const doc of affected) {
    const encodedKey = encodeURIComponent(doc.key);
    const current = await requestJson<AdminDocument>(
      baseUrl,
      token,
      `/api/config/admin/${group.namespace}/documents/${encodedKey}`
    );
    if (current.status !== 200 || !current.body?.published) {
      throw new Error(`Unable to read ${doc.key} (status ${current.status})`);
    }

    // An unpublished draft is somebody's work in progress. Overwriting it would
    // discard edits that were never reviewed, and the loss would be silent.
    if (current.body.draft && !force) {
      console.log(`  SKIP  ${doc.key} - has an unpublished draft (rerun with --force to overwrite)`);
      skipped += 1;
      continue;
    }

    const next = applySubstitutions(current.body.published.payload, group.substitutions);
    if (!next.changed) {
      console.log(`  SKIP  ${doc.key} - already current`);
      skipped += 1;
      continue;
    }

    if (!apply) {
      console.log(`  WOULD ${doc.key}`);
      continue;
    }

    const draft = await requestJson<{ draft: { id: string } }>(
      baseUrl,
      token,
      `/api/config/admin/${group.namespace}/documents/${encodedKey}/draft`,
      {
        method: "PUT",
        body: JSON.stringify({ payload: next.payload, changeSummary: group.description })
      }
    );
    if (draft.status !== 200 || !draft.body?.draft) {
      throw new Error(`Failed to write the draft for ${doc.key} (status ${draft.status})`);
    }

    const result = await requestJson(
      baseUrl,
      token,
      `/api/config/admin/${group.namespace}/documents/${encodedKey}/publish`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedDraftVersionId: draft.body.draft.id,
          publishNote: group.description
        })
      }
    );
    if (result.status !== 200) {
      throw new Error(`Failed to publish ${doc.key} (status ${result.status})`);
    }
    console.log(`  OK    ${doc.key}`);
    published += 1;
  }

  console.log(
    apply
      ? `\nPublished ${published}, skipped ${skipped}.`
      : `\nDry run only. Rerun with --apply to publish ${affected.length - skipped} document(s).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
