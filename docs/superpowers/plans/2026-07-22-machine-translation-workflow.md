# Machine Translation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin machine-translate one lesson or all 43 into Pidgin and Igbo, review the drafts against the WhatsApp character gauges, and promote approved translations into live content through the normal audited publish path — never overwriting human work or misaligning quiz answers.

**Architecture:** Machine output lands in a dedicated `translation_drafts` store, one row per (content document, target language), never directly in live content. A quota-aware, resumable runner drives provider adapters (Igbo API for `ig`, an LLM for `pcm` and for the 20-char quiz options). Reviewers edit drafts in a Translations tab with the same compose-gauges the content form uses. Approval promotes a single language into the content document's draft and publishes it with a conflict check, so an approved Igbo translation can never ship a colleague's unfinished English edit.

**Tech Stack:** TypeScript, Express 5, Prisma 7 (`@prisma/adapter-pg`, `$executeRawUnsafe` bootstrap), Zod 4, `node:test` + `tsx`, Next.js 16 App Router. Providers: Nkọwa okwu Igbo API (REST), Google Gemini (REST `generateContent`), Anthropic Messages API.

---

## Background — decisions already made

Read these before starting; they are the "questionable taste" guardrails.

- **Provider is chosen per language, not globally.** The Igbo API does `eng↔ibo` only — it cannot produce Pidgin, and no translation API can (Google added `pcm` to consumer Translate but never to Cloud Translation). Only an LLM produces Pidgin, and only an LLM can be told the **20-character WhatsApp button budget** that quiz options must fit. `providerByLanguage: { pcm, ig }` already exists in the contracts (Task-0 below is already done).

- **The `answerIndex` corruption class is the top risk.** Quiz options are a positional array and `answerIndex` points into it. A provider that reorders, merges, or drops an option silently makes the wrong answer "correct" — in a language the reviewer may be the only person who can read. Every option is translated as its own unit keyed by position and reassembled **by id, never by provider array order**. If any option in a question fails, that question's options stay English rather than promote a misaligned set.

- **Over-budget results are flagged, never truncated.** Cutting Igbo mid-word to hit 20 chars is nonsense a reviewer rewrites anyway. The gauges show red; the reviewer fixes it.

- **Nothing auto-publishes.** Machine output is `machine_draft`. A human moves it to `approved`. Only `approved` promotes. The content teaches money decisions; the human gate is non-negotiable.

- **Promotion is per-language and conflict-aware.** Publishing a content document is atomic over the whole payload (`languages.en/pcm/ig`, every quiz variant). Promoting Igbo must change only the `ig` fields, and must **refuse** (not clobber) if the content document has a pending draft that isn't ours — otherwise an approved translation ships someone's half-finished English.

- **The daily request cap is configuration, not an assumption.** Nkọwa okwu document 2,500/day; the operator reported 500. `igboApi.dailyRequestLimit` defaults to 2,500 and is editable. The runner paces against it and stops cleanly, resuming next run.

### Already done (branch `feat/translation-provider-adapter`, do not redo)

- `backend/src/translation/providers/contracts.ts` — `TranslationIntegrationPayload`, `TranslationUnit`, `TranslationOutcome`, `TranslationProvider`, `providersSupporting()`, `TRANSLATION_LANGUAGES`.
- `backend/src/translation/providers/igbo-api.ts` + tests — `createIgboApiAdapter()`, `igboApiAdapter`. 20 tests pass.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/prisma/schema.prisma` | `TranslationDraft` model (Modify) |
| `backend/src/admin/prisma.ts` | `translation_drafts` table bootstrap (Modify) |
| `backend/src/translation/providers/llm.ts` (+test) | Gemini + Anthropic adapter, length- and context-aware (Create) |
| `backend/src/translation/providers/index.ts` (+test) | Provider factory + `verifyTranslationConfig` (Create) |
| `backend/src/translation/extract.ts` (+test) | Lesson payload → `TranslationUnit[]`; outcomes → draft payload. The positional guarantee lives here (Create) |
| `backend/src/translation/draft-store.ts` (+test) | `translation_drafts` repository: upsert, status transitions, source hash (Create) |
| `backend/src/translation/runner.ts` (+test) | Quota-aware, resumable batch runner (Create) |
| `backend/src/translation/promote.ts` (+test) | Conflict-aware per-language promotion into the content document (Create) |
| `backend/src/config-platform/contracts.ts` | Add translation payload to the integration union + validation (Modify) |
| `backend/src/config-platform/runtime-config.ts` | `getRuntimeTranslationConfig()` (Modify) |
| `backend/src/routes/integrations-admin.ts` | `POST /translation/test` (Modify) |
| `backend/src/routes/translation.ts` (+test) | Admin routes: list / run / get / save edits / approve / promote (Create) |
| `backend/src/app.ts` | Mount the translation router (Modify) |
| `dashboard/components/integration/types.ts` | `TranslationIntegrationForm` (Modify) |
| `dashboard/components/integration/IntegrationConfigDrawer.tsx` | Translation provider fields (Modify) |
| `dashboard/components/integration/IntegrationSettingsWorkspace.tsx` | Register the Translations tab after Payouts (Modify) |
| `dashboard/components/translation/TranslationReviewWorkspace.tsx` (+preview) | Draft list + per-lesson review with gauges (Create) |
| `dashboard/lib/admin/api.ts` + `contracts.ts` | Translation API client + types (Modify) |
| `docs/superpowers/plans/...`, `task-list.md`, `handoff.md` | Tracking (Modify) |

---

## Task 1: `translation_drafts` store — schema + bootstrap

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/admin/prisma.ts` (inside `ensurePrismaTables`, alongside `translation_requests`)

One row per (content document, target language). Holds the translated strings as JSON mirroring the content payload's localizable fields, a review status, an assignee, and a hash of the English it was translated from (for staleness detection).

- [ ] **Step 1: Add the Prisma model**

In `backend/prisma/schema.prisma`, after the `TranslationRequest` model:

```prisma
model TranslationDraft {
  id                String   @id @default(uuid())
  contentDocumentId String
  contentKey        String
  targetLanguage    String   // "pcm" | "ig"
  // Translated strings, shape: { title?, body?, quiz: [{ question?, options: (string|null)[] }] }
  // A null option means that option failed translation and must stay English.
  payload           Json
  // Per-string machine outcome summary for the reviewer, e.g. counts of
  // translated / failed / over-budget. Recomputed on each run.
  runSummary        Json?
  status            String   @default("machine_draft") // machine_draft | in_review | approved | promoted
  assignee          String?
  // Hash of the English source strings at translation time. If the live English
  // no longer hashes to this, the draft is stale.
  sourceHash        String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  promotedAt        DateTime?

  @@unique([contentDocumentId, targetLanguage])
  @@map("translation_drafts")
}
```

- [ ] **Step 2: Add the bootstrap**

In `backend/src/admin/prisma.ts`, immediately after the `translation_requests` bootstrap block (the one ending its `for` loop of ALTERs), add:

```ts
    // translation_drafts — machine-translated strings awaiting human review.
    // One row per (content document, target language). Never written to live
    // content directly; promotion copies approved strings into the content
    // document's draft. Keep in sync with the TranslationDraft model.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS translation_drafts (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["contentDocumentId", "TEXT"],
      ["contentKey", "TEXT"],
      ["targetLanguage", "TEXT"],
      ["payload", "JSONB NOT NULL DEFAULT '{}'::jsonb"],
      ["runSummary", "JSONB"],
      ["status", "TEXT NOT NULL DEFAULT 'machine_draft'"],
      ["assignee", "TEXT"],
      ["sourceHash", "TEXT NOT NULL DEFAULT ''"],
      ["createdAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["promotedAt", "TIMESTAMP(3)"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE translation_drafts ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS translation_drafts_doc_lang_key ON translation_drafts ("contentDocumentId", "targetLanguage");`
    );
```

- [ ] **Step 3: Regenerate the client and typecheck**

Run: `cd backend && npx prisma generate && npm run typecheck`
Expected: exit 0. (No unit test — this is schema; the store test in Task 4 exercises it, skipping without a DB.)

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/admin/prisma.ts
git commit -m "feat(translation): translation_drafts store schema + bootstrap"
```

---

## Task 2: Source hashing + unit extraction (the positional guarantee)

**Files:**
- Create: `backend/src/translation/extract.ts`
- Test: `backend/src/translation/extract.test.ts`

This is where quiz-option integrity is enforced. It turns a content lesson payload into `TranslationUnit[]` with position-encoded ids and per-string `maxLength`/`context`, and reassembles `TranslationOutcome[]` back into a draft payload **by id**, so provider array order can never misalign `answerIndex`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/translation/extract.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { extractUnits, hashSource, assembleDraftPayload } from "./extract.js";
import { WHATSAPP_LIMITS } from "../whatsapp/constraints.js";

const LESSON = {
  title: "My WhatsApp Business Shop",
  module: "Module 2",
  languages: { en: "Using standard WhatsApp to run a busy shop is like..." },
  quiz: [
    {
      question: "Which tool shows products with prices?",
      options: ["Catalog", "Status only", "Profile photo"],
      answerIndex: 0
    }
  ]
};

test("extractUnits emits one unit per translatable string with position ids", () => {
  const units = extractUnits(LESSON, "ig");
  const ids = units.map((u) => u.id);
  assert.deepEqual(ids, ["title", "body", "q0.question", "q0.opt0", "q0.opt1", "q0.opt2"]);
});

test("quiz option units carry the 20-char WhatsApp budget", () => {
  const units = extractUnits(LESSON, "ig");
  const opt = units.find((u) => u.id === "q0.opt0");
  assert.equal(opt?.maxLength, WHATSAPP_LIMITS.buttonTitle);
  assert.match(opt?.context ?? "", /option|button/i);
});

test("body and title carry their own budgets and no false option budget", () => {
  const units = extractUnits(LESSON, "ig");
  assert.equal(units.find((u) => u.id === "body")?.maxLength, WHATSAPP_LIMITS.interactiveBody);
  assert.equal(units.find((u) => u.id === "title")?.maxLength, WHATSAPP_LIMITS.listRowTitle);
});

test("every unit targets the requested language", () => {
  for (const u of extractUnits(LESSON, "pcm")) assert.equal(u.targetLanguage, "pcm");
});

test("hashSource is stable and content-sensitive", () => {
  const a = hashSource(LESSON);
  assert.equal(a, hashSource({ ...LESSON })); // same content, same hash
  const changed = { ...LESSON, languages: { en: "different body" } };
  assert.notEqual(a, hashSource(changed));
});

test("assembleDraftPayload reassembles by ID, immune to outcome order", () => {
  const outcomes = [
    { id: "q0.opt2", status: "translated", text: "C-ig", overBudget: false },
    { id: "title", status: "translated", text: "Title-ig", overBudget: false },
    { id: "q0.opt0", status: "translated", text: "A-ig", overBudget: false },
    { id: "body", status: "translated", text: "Body-ig", overBudget: false },
    { id: "q0.question", status: "translated", text: "Q-ig", overBudget: false },
    { id: "q0.opt1", status: "translated", text: "B-ig", overBudget: false }
  ] as const;
  const draft = assembleDraftPayload(LESSON, [...outcomes]);
  assert.equal(draft.title, "Title-ig");
  assert.equal(draft.body, "Body-ig");
  assert.deepEqual(draft.quiz[0]?.options, ["A-ig", "B-ig", "C-ig"]); // position preserved
});

test("a failed option becomes null so the whole set stays English on promote", () => {
  const outcomes = [
    { id: "q0.opt0", status: "translated", text: "A-ig", overBudget: false },
    { id: "q0.opt1", status: "failed", reason: "boom", retryable: true },
    { id: "q0.opt2", status: "translated", text: "C-ig", overBudget: false }
  ] as const;
  const draft = assembleDraftPayload(LESSON, [...outcomes]);
  // opt1 is null — the promotion step must treat any null in a question's
  // options as "leave this whole question's options English", because a
  // 2-of-3 translated set would misalign answerIndex.
  assert.deepEqual(draft.quiz[0]?.options, ["A-ig", null, "C-ig"]);
});

test("extract then assemble round-trips option COUNT exactly", () => {
  const units = extractUnits(LESSON, "ig").filter((u) => u.id.startsWith("q0.opt"));
  assert.equal(units.length, LESSON.quiz[0]!.options.length);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx tsx --test src/translation/extract.test.ts`
Expected: FAIL — module has no exports.

- [ ] **Step 3: Implement**

Create `backend/src/translation/extract.ts`:

```ts
import { createHash } from "node:crypto";
import { WHATSAPP_LIMITS } from "../whatsapp/constraints.js";
import type { TranslationLanguage, TranslationOutcome, TranslationUnit } from "./providers/contracts.js";
import { pickLocalized, type LocalizedValue } from "../config-platform/runtime-config.js";

/** The English source strings that define a lesson's meaning, for hashing. */
function englishStrings(lesson: any): string[] {
  const out: string[] = [];
  out.push(pickLocalized(lesson?.title as LocalizedValue, "en"));
  out.push(String(lesson?.languages?.en ?? ""));
  for (const q of (Array.isArray(lesson?.quiz) ? lesson.quiz : [])) {
    out.push(pickLocalized(q?.question as LocalizedValue, "en"));
    for (const o of (Array.isArray(q?.options) ? q.options : [])) {
      out.push(pickLocalized(o as LocalizedValue, "en"));
    }
  }
  return out;
}

/** Stable content hash of the English source. Detects post-translation drift. */
export function hashSource(lesson: any): string {
  return createHash("sha256").update(englishStrings(lesson).join(" ")).digest("hex");
}

/**
 * Turn a lesson into translation units. Ids encode POSITION (`q0.opt2`) so the
 * result can be reassembled by id — never by the order a provider returns.
 * Each unit carries the WhatsApp budget for its own string.
 */
export function extractUnits(lesson: any, target: TranslationLanguage): TranslationUnit[] {
  const units: TranslationUnit[] = [];
  const en = (v: unknown) => pickLocalized(v as LocalizedValue, "en");

  const title = en(lesson?.title);
  if (title) {
    units.push({ id: "title", text: title, targetLanguage: target, maxLength: WHATSAPP_LIMITS.listRowTitle, context: "lesson title shown as a WhatsApp list row" });
  }
  const body = String(lesson?.languages?.en ?? "");
  if (body) {
    units.push({ id: "body", text: body, targetLanguage: target, maxLength: WHATSAPP_LIMITS.interactiveBody, context: "lesson body shown in a WhatsApp interactive message" });
  }
  (Array.isArray(lesson?.quiz) ? lesson.quiz : []).forEach((q: any, qi: number) => {
    const question = en(q?.question);
    if (question) {
      units.push({ id: `q${qi}.question`, text: question, targetLanguage: target, maxLength: WHATSAPP_LIMITS.interactiveBody, context: "quiz question" });
    }
    (Array.isArray(q?.options) ? q.options : []).forEach((o: any, oi: number) => {
      const opt = en(o);
      units.push({ id: `q${qi}.opt${oi}`, text: opt, targetLanguage: target, maxLength: WHATSAPP_LIMITS.buttonTitle, context: "quiz answer button — must be extremely short" });
    });
  });
  return units;
}

export type DraftPayload = {
  title?: string;
  body?: string;
  quiz: Array<{ question?: string; options: Array<string | null> }>;
};

/**
 * Reassemble outcomes into a draft payload BY ID. A failed option is stored as
 * null, which the promotion step reads as "leave this question's options
 * English" — a partial option set would misalign answerIndex.
 */
export function assembleDraftPayload(lesson: any, outcomes: TranslationOutcome[]): DraftPayload {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const textOf = (id: string): string | null => {
    const o = byId.get(id);
    return o && o.status === "translated" ? o.text : null;
  };

  const draft: DraftPayload = { quiz: [] };
  const title = textOf("title");
  if (title !== null) draft.title = title;
  const body = textOf("body");
  if (body !== null) draft.body = body;

  (Array.isArray(lesson?.quiz) ? lesson.quiz : []).forEach((q: any, qi: number) => {
    const question = textOf(`q${qi}.question`);
    const options = (Array.isArray(q?.options) ? q.options : []).map(
      (_o: unknown, oi: number) => textOf(`q${qi}.opt${oi}`)
    );
    draft.quiz.push({ ...(question !== null ? { question } : {}), options });
  });
  return draft;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npx tsx --test src/translation/extract.test.ts` → 8 pass.
Run: `cd backend && npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/translation/extract.ts backend/src/translation/extract.test.ts
git commit -m "feat(translation): position-keyed unit extraction + source hashing

Reassembly is by id, so a provider that returns options in a different order
cannot misalign answerIndex. A failed option becomes null so the whole
question's options stay English rather than promote a misaligned 2-of-3 set."
```

---

## Task 3: LLM provider adapter (Pidgin + constrained options)

**Files:**
- Create: `backend/src/translation/providers/llm.ts`
- Test: `backend/src/translation/providers/llm.test.ts`

Handles `gemini` and `anthropic` keys. This is the only route to Pidgin, and the only provider that can honour `maxLength`. **Before implementing the Anthropic branch, load the `claude-api` skill** to confirm the current model id and Messages API shape — do not guess them.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/translation/providers/llm.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createLlmAdapter } from "./llm.js";
import { translationIntegrationPayloadSchema } from "./contracts.js";

const CONFIG = translationIntegrationPayloadSchema.parse({
  title: "t",
  providerByLanguage: { pcm: "gemini", ig: "gemini" },
  gemini: { apiKey: "g-key", model: "gemini-2.5-flash" }
});

function stubFetch(reply: (body: string) => { status: number; json: unknown }) {
  const calls: string[] = [];
  const impl = (async (_url: unknown, init: unknown) => {
    const body = String((init as RequestInit).body ?? "");
    calls.push(body);
    const r = reply(body);
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// Gemini generateContent returns { candidates: [{ content: { parts: [{ text }] } }] }
function geminiOk(text: string) {
  return { status: 200, json: { candidates: [{ content: { parts: [{ text }] } }] } };
}

test("produces Pidgin — the language no translation API supports", async () => {
  const { impl } = stubFetch(() => geminiOk("How you dey run your shop?"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate(
    [{ id: "body", text: "How do you run your shop?", targetLanguage: "pcm" }],
    CONFIG
  );
  assert.equal(out?.status, "translated");
  assert.equal((out as { text: string }).text, "How you dey run your shop?");
});

test("the length budget is put in the prompt", async () => {
  const { impl, calls } = stubFetch(() => geminiOk("Katalog"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  await adapter.translate(
    [{ id: "q0.opt0", text: "Catalog", targetLanguage: "ig", maxLength: 20, context: "quiz answer button" }],
    CONFIG
  );
  assert.match(calls[0] ?? "", /20/);
  assert.match(calls[0] ?? "", /quiz answer button/);
});

test("a result over budget is flagged, not truncated", async () => {
  const { impl } = stubFetch(() => geminiOk("a translation that is definitely longer than twenty"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate(
    [{ id: "q0.opt0", text: "x", targetLanguage: "ig", maxLength: 20 }],
    CONFIG
  );
  assert.equal((out as { overBudget: boolean }).overBudget, true);
  assert.equal((out as { text: string }).text.length > 20, true);
});

test("model surrounding prose is stripped to just the translation", async () => {
  // LLMs sometimes answer 'Here is the translation: "X"'. We keep only X.
  const { impl } = stubFetch(() => geminiOk('Here is the translation: "Katalog"'));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate(
    [{ id: "q0.opt0", text: "Catalog", targetLanguage: "ig" }],
    CONFIG
  );
  assert.equal((out as { text: string }).text, "Katalog");
});

test("an HTTP 429 is retryable", async () => {
  const { impl } = stubFetch(() => ({ status: 429, json: {} }));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate([{ id: "a", text: "x", targetLanguage: "ig" }], CONFIG);
  assert.equal(out?.status, "failed");
  assert.equal((out as { retryable: boolean }).retryable, true);
});

test("an empty model response is a failure, not an empty success", async () => {
  const { impl } = stubFetch(() => geminiOk("   "));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate([{ id: "a", text: "x", targetLanguage: "ig" }], CONFIG);
  assert.equal(out?.status, "failed");
});

test("verifyCredentials fails fast without an API key", async () => {
  const { impl, calls } = stubFetch(() => geminiOk("x"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const result = await adapter.verifyCredentials({
    ...CONFIG,
    gemini: { apiKey: "", model: "gemini-2.5-flash" }
  });
  assert.equal(result.status, "failed");
  assert.equal(calls.length, 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx tsx --test src/translation/providers/llm.test.ts`
Expected: FAIL — no `createLlmAdapter`.

- [ ] **Step 3: Implement**

Create `backend/src/translation/providers/llm.ts`. The Gemini branch is complete below. **For the Anthropic branch, load the `claude-api` skill first** and fill in `callAnthropic` using the model id from `config.anthropic.model` (default `claude-sonnet-5`) and the Messages API; the surrounding contract (prompt, parsing, outcome shape) is identical to Gemini.

```ts
import type {
  TranslationConnectionResult,
  TranslationIntegrationPayload,
  TranslationLanguage,
  TranslationOutcome,
  TranslationProvider,
  TranslationProviderKey,
  TranslationUnit
} from "./contracts.js";

type Dependencies = { fetchImpl?: typeof fetch };
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function languageName(l: TranslationLanguage): string {
  return l === "pcm" ? "Nigerian Pidgin (as spoken by traders, natural and warm — not textbook)" : "Igbo";
}

/** The instruction that makes output usable: target, register, length, context. */
function buildPrompt(unit: TranslationUnit): string {
  const lines = [
    `Translate the following English text into ${languageName(unit.targetLanguage)}.`,
    `This is for a WhatsApp learning bot teaching Nigerian women traders about business.`,
    unit.context ? `Context: ${unit.context}.` : "",
    unit.maxLength
      ? `The translation MUST be ${unit.maxLength} characters or fewer — it is shown on a small screen element. Prefer a shorter natural phrasing over a literal one.`
      : "",
    `Reply with ONLY the translation. No quotes, no explanation, no preamble.`,
    ``,
    `English: ${unit.text}`
  ];
  return lines.filter(Boolean).join("\n");
}

/** Strip common LLM wrappers: surrounding quotes, "Here is the translation:" etc. */
function cleanOutput(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^(here (is|'s) the translation[:\s]*)/i, "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

async function callGemini(
  prompt: string,
  config: TranslationIntegrationPayload,
  fetchImpl: typeof fetch
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  const model = config.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.gemini.apiKey)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) return { ok: false, status: response.status, message: `HTTP ${response.status}` };
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { ok: true, text };
}

async function callAnthropic(
  _prompt: string,
  _config: TranslationIntegrationPayload,
  _fetchImpl: typeof fetch
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  // IMPLEMENTER: load the claude-api skill, then call the Messages API with
  // model = _config.anthropic.model, a single user message = _prompt, and
  // return the first text block. Same shape as callGemini. Do not guess the
  // model id or endpoint — the skill has the current values.
  throw new Error("callAnthropic not implemented — load the claude-api skill.");
}

export function createLlmAdapter(
  key: Extract<TranslationProviderKey, "gemini" | "anthropic">,
  dependencies: Dependencies = {}
): TranslationProvider {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const call = key === "gemini" ? callGemini : callAnthropic;
  const apiKeyOf = (c: TranslationIntegrationPayload) =>
    key === "gemini" ? c.gemini.apiKey : c.anthropic.apiKey;

  return {
    key,
    supports: ["pcm", "ig"],
    requestsPerUnit: 1,

    async verifyCredentials(config): Promise<TranslationConnectionResult> {
      const started = Date.now();
      if (!apiKeyOf(config)) return { status: "failed", message: `Add a ${key} API key before testing.` };
      try {
        const r = await call(buildPrompt({ id: "t", text: "water", targetLanguage: "ig" }), config, fetchImpl);
        const latencyMs = Date.now() - started;
        if (!r.ok) return { status: "failed", message: `${key} rejected the request (${r.message}).` };
        if (!cleanOutput(r.text)) return { status: "degraded", latencyMs, message: `${key} responded but returned no text.` };
        return { status: "healthy", latencyMs, message: `${key} reachable; can produce Pidgin and Igbo.` };
      } catch (error) {
        return { status: "failed", message: error instanceof Error ? error.message : String(error) };
      }
    },

    async translate(units, config): Promise<TranslationOutcome[]> {
      const out: TranslationOutcome[] = [];
      for (const unit of units) {
        try {
          const r = await call(buildPrompt(unit), config, fetchImpl);
          if (!r.ok) {
            out.push({ id: unit.id, status: "failed", reason: r.message, retryable: RETRYABLE.has(r.status) });
            continue;
          }
          const text = cleanOutput(r.text);
          if (!text) {
            out.push({ id: unit.id, status: "failed", reason: "Empty model response.", retryable: false });
            continue;
          }
          out.push({
            id: unit.id,
            status: "translated",
            text,
            overBudget: unit.maxLength !== undefined && text.length > unit.maxLength
          });
        } catch (error) {
          out.push({ id: unit.id, status: "failed", reason: error instanceof Error ? error.message : String(error), retryable: true });
        }
      }
      return out;
    }
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npx tsx --test src/translation/providers/llm.test.ts` → 7 pass (Gemini path).
Run: `cd backend && npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/translation/providers/llm.ts backend/src/translation/providers/llm.test.ts
git commit -m "feat(translation): LLM adapter (Gemini + Anthropic) with length + context prompting"
```

---

## Task 4: Provider factory + Test Connection

**Files:**
- Create: `backend/src/translation/providers/index.ts`
- Test: `backend/src/translation/providers/index.test.ts`

Mirrors `backend/src/payouts/providers/index.ts` — read that file first; the shape is identical.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/translation/providers/index.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectTranslationAdapter } from "./index.js";

test("igbo_api selects the Igbo adapter", () => {
  assert.equal(selectTranslationAdapter("igbo_api").key, "igbo_api");
});

test("gemini and anthropic select the LLM adapter with the right key", () => {
  assert.equal(selectTranslationAdapter("gemini").key, "gemini");
  assert.equal(selectTranslationAdapter("anthropic").key, "anthropic");
});

test("the Igbo adapter does not claim Pidgin support", () => {
  assert.ok(!selectTranslationAdapter("igbo_api").supports.includes("pcm"));
});

test("the LLM adapters claim both languages", () => {
  assert.deepEqual([...selectTranslationAdapter("gemini").supports].sort(), ["ig", "pcm"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx tsx --test src/translation/providers/index.test.ts`
Expected: FAIL — no `selectTranslationAdapter`.

- [ ] **Step 3: Implement**

Create `backend/src/translation/providers/index.ts`:

```ts
import { igboApiAdapter } from "./igbo-api.js";
import { createLlmAdapter } from "./llm.js";
import type {
  TranslationConnectionResult,
  TranslationIntegrationPayload,
  TranslationLanguage,
  TranslationProvider,
  TranslationProviderKey
} from "./contracts.js";

const geminiAdapter = createLlmAdapter("gemini");
const anthropicAdapter = createLlmAdapter("anthropic");

export function selectTranslationAdapter(key: TranslationProviderKey): TranslationProvider {
  switch (key) {
    case "igbo_api":
      return igboApiAdapter;
    case "gemini":
      return geminiAdapter;
    case "anthropic":
      return anthropicAdapter;
  }
}

/** The provider configured for a given target language. */
export function adapterForLanguage(
  config: TranslationIntegrationPayload,
  language: TranslationLanguage
): TranslationProvider {
  return selectTranslationAdapter(config.providerByLanguage[language]);
}

/**
 * Test Connection: verify every DISTINCT provider referenced by the config, so
 * an admin learns up front that (say) their Gemini key works but their Igbo
 * key is rejected — rather than discovering it mid-run. Returns the worst
 * status seen, with a per-provider breakdown in the message.
 */
export async function verifyTranslationConfig(
  config: TranslationIntegrationPayload
): Promise<TranslationConnectionResult> {
  const keys = Array.from(new Set(Object.values(config.providerByLanguage)));
  const results = await Promise.all(
    keys.map(async (k) => ({ k, r: await selectTranslationAdapter(k).verifyCredentials(config) }))
  );
  const failed = results.filter((x) => x.r.status === "failed");
  const degraded = results.filter((x) => x.r.status === "degraded");
  const summary = results.map((x) => `${x.k}: ${x.r.status}`).join(", ");
  if (failed.length > 0) {
    return { status: "failed", message: `One or more providers failed — ${summary}. ${failed[0]!.r.message}` };
  }
  if (degraded.length > 0) {
    return { status: "degraded", latencyMs: 0, message: `Reachable with warnings — ${summary}.` };
  }
  return { status: "healthy", latencyMs: 0, message: `All configured providers reachable — ${summary}.` };
}
```

- [ ] **Step 4: Run to verify pass** — `cd backend && npx tsx --test src/translation/providers/index.test.ts` → 4 pass; `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/translation/providers/index.ts backend/src/translation/providers/index.test.ts
git commit -m "feat(translation): provider factory + multi-provider verifyTranslationConfig"
```

---

## Task 5: Wire the translation integration config

**Files:**
- Modify: `backend/src/config-platform/contracts.ts`
- Modify: `backend/src/config-platform/runtime-config.ts`
- Test: extend `backend/src/config-platform/reward-rules.test.ts` is NOT the place — add `backend/src/config-platform/translation-config.test.ts`

The translation settings are stored as an `integration_config` document under `integration.translation.primary`, exactly like payouts/whatsapp/notification.

- [ ] **Step 1: Write the failing test**

Create `backend/src/config-platform/translation-config.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { integrationConfigPayloadSchema } from "./contracts.js";

test("a translation payload is accepted by the integration union", () => {
  const parsed = integrationConfigPayloadSchema.parse({
    title: "Primary Translation Integration",
    kind: "translation",
    enabled: true,
    providerByLanguage: { pcm: "gemini", ig: "igbo_api" },
    igboApi: { apiKey: "k", baseUrl: "https://igboapi.com", dailyRequestLimit: 2500 },
    gemini: { apiKey: "g", model: "gemini-2.5-flash" },
    anthropic: { apiKey: "", model: "claude-sonnet-5" }
  });
  assert.equal((parsed as { kind?: string }).kind, "translation");
});

test("an SMTP payload still routes to the notification member, not translation", () => {
  const parsed = integrationConfigPayloadSchema.parse({
    title: "SMTP", provider: "smtp", enabled: true, host: "h", port: 587, secure: false,
    username: "u", password: "p", fromName: "n", fromEmail: "f@x.com"
  });
  assert.equal((parsed as { provider?: string }).provider, "smtp");
});
```

- [ ] **Step 2: Run to verify failure** — `cd backend && npx tsx --test src/config-platform/translation-config.test.ts` → FAIL (translation payload rejected).

- [ ] **Step 3: Implement**

The integration union is a `z.union` that tries each member. The translation payload has no `provider` literal, so add a `kind: "translation"` discriminant (like `rewardRulesPayloadSchema` uses `kind: "reward_rules"`) to keep it unambiguous. In `backend/src/config-platform/contracts.ts`:

```ts
import { translationIntegrationPayloadSchema } from "../translation/providers/contracts.js";

// A discriminated `kind` keeps this distinct from the SMTP/whatsapp payloads,
// which are matched by their `provider` literal.
export const translationConfigPayloadSchema = translationIntegrationPayloadSchema.extend({
  kind: z.literal("translation")
});
```

and add it to the union:

```ts
export const integrationConfigPayloadSchema = z.union([
  whatsappIntegrationPayloadSchema,
  notificationIntegrationPayloadSchema,
  payoutsIntegrationPayloadSchema,
  rewardRulesPayloadSchema,
  translationConfigPayloadSchema
]);
```

Add the runtime accessor in `backend/src/config-platform/runtime-config.ts`, next to `getRuntimePayoutsConfig`:

```ts
import type { TranslationIntegrationPayload } from "../translation/providers/contracts.js";

export function getRuntimeTranslationConfig() {
  return getRuntimeIntegrationConfig<TranslationIntegrationPayload & { kind: "translation" }>(
    "integration.translation.primary"
  );
}
```

- [ ] **Step 4: Run to verify pass** — the translation-config test passes; run `npx tsx --test src/config-platform/*.test.ts` to confirm no other integration payload changed routing. `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config-platform/contracts.ts backend/src/config-platform/runtime-config.ts backend/src/config-platform/translation-config.test.ts
git commit -m "feat(translation): store settings as integration.translation.primary"
```

---

## Task 6: Draft store repository

**Files:**
- Create: `backend/src/translation/draft-store.ts`
- Test: `backend/src/translation/draft-store.test.ts` (DB-guarded, like `translation-requests.test.ts`)

CRUD over `translation_drafts`: upsert a run result, read for review, save reviewer edits, transition status, and the overwrite guard.

- [ ] **Step 1: Write the failing tests** (guard with `skipWithoutDb` exactly as `backend/src/routes/translation-requests.test.ts` does — copy that guard). Cover: `upsertMachineDraft` creates a row with `status: "machine_draft"` and the source hash; a second run **refuses to overwrite** a draft whose status is past `machine_draft`; `saveReviewerEdits` updates payload + sets `in_review`; `setStatus` enforces the `machine_draft → in_review → approved → promoted` order and rejects skips; `listDrafts` returns rows ordered by `updatedAt desc`.

```ts
// backend/src/translation/draft-store.test.ts — abbreviated shape; write full bodies.
import test from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "./draft-store.js";

// Pure transition guard is testable without a DB.
test("status transitions only move forward through the review stages", () => {
  assert.equal(canTransition("machine_draft", "in_review"), true);
  assert.equal(canTransition("in_review", "approved"), true);
  assert.equal(canTransition("approved", "promoted"), true);
  assert.equal(canTransition("approved", "machine_draft"), false); // no going back
  assert.equal(canTransition("machine_draft", "approved"), false);  // no skipping review
});

test("a re-run may overwrite a machine_draft but never reviewed work", () => {
  assert.equal(canOverwrite("machine_draft"), true);
  assert.equal(canOverwrite("in_review"), false);
  assert.equal(canOverwrite("approved"), false);
  assert.equal(canOverwrite("promoted"), false);
});
```

Import `canTransition` and `canOverwrite` in the test.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `backend/src/translation/draft-store.ts`.** Export the two pure guards plus the DB functions. The DB functions use `prisma.translationDraft` (from `../admin/prisma.js`). Key rule enforced in `upsertMachineDraft`: read any existing row first; if it exists and `!canOverwrite(existing.status)`, return `{ skipped: true, reason }` without writing — this is what protects reviewed work from a re-run.

```ts
export type DraftStatus = "machine_draft" | "in_review" | "approved" | "promoted";
const ORDER: DraftStatus[] = ["machine_draft", "in_review", "approved", "promoted"];

export function canTransition(from: DraftStatus, to: DraftStatus): boolean {
  return ORDER.indexOf(to) === ORDER.indexOf(from) + 1;
}
export function canOverwrite(status: DraftStatus): boolean {
  return status === "machine_draft";
}
// ...DB functions: upsertMachineDraft, getDraft, listDrafts, saveReviewerEdits, setStatus.
```

- [ ] **Step 4: Run to verify pass** (pure guards pass; DB tests skip without Postgres). `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit** — `feat(translation): translation_drafts repository with forward-only review status`

---

## Task 7: The quota-aware, resumable runner

**Files:**
- Create: `backend/src/translation/runner.ts`
- Test: `backend/src/translation/runner.test.ts`

Drives extraction → provider → assembly → draft store for one or many lessons, pacing against the Igbo API daily cap and resuming where a previous run stopped.

- [ ] **Step 1: Write the failing tests.** Cover, with a fake clock/budget and a stub provider:
  - a run of N lessons for `ig` consumes `requestsPerUnit × units` requests and **stops when the remaining budget cannot fit the next lesson**, returning `{ stopped: "quota", remaining, done }`;
  - `pcm` runs are **not** counted against the Igbo cap (different provider);
  - a lesson whose draft is past `machine_draft` is **skipped**, not re-translated;
  - the budget is per-provider-per-day, read from `dailyRequestLimit` minus what today's runs already spent (persist a per-day counter, or derive from draft timestamps — derive is simpler and needs no new table: count `igbo_api` units translated since UTC midnight).

```ts
// Pure budget math is the testable core — keep it a pure function.
import { planBudget } from "./runner.js";
test("planBudget stops before a lesson that would exceed the daily cap", () => {
  // 500 cap, 480 already spent today, each lesson needs 14 igbo_api requests.
  const plan = planBudget({ dailyLimit: 500, spentToday: 480, perLesson: 14, lessons: 5 });
  assert.equal(plan.lessonsToRun, 1); // 480+14=494 fits; a 2nd would be 508 > 500
  assert.equal(plan.willStopForQuota, true);
});
test("planBudget runs everything when the cap is ample", () => {
  const plan = planBudget({ dailyLimit: 2500, spentToday: 0, perLesson: 14, lessons: 43 });
  assert.equal(plan.lessonsToRun, 43);
  assert.equal(plan.willStopForQuota, false);
});
```

- [ ] **Step 2–4:** Implement `planBudget` (pure) and `runTranslation({ documentIds, language, config })` (orchestration: load each content doc's published payload via the config service, `extractUnits`, call `adapterForLanguage(...).translate`, `assembleDraftPayload`, `upsertMachineDraft` with `hashSource`). Only `igbo_api` units count against the cap; LLM providers are treated as unmetered here (their own rate limits are handled by retryable outcomes). Run tests → pass; typecheck → exit 0.

- [ ] **Step 5: Commit** — `feat(translation): quota-aware resumable runner`

---

## Task 8: Conflict-aware promotion

**Files:**
- Create: `backend/src/translation/promote.ts`
- Test: `backend/src/translation/promote.test.ts`

Copies an **approved** draft's strings into the content document and publishes — changing only the target language, refusing on conflict, and skipping any question whose option set is incomplete.

- [ ] **Step 1: Write the failing tests.** The payload-merge logic is pure and is where the risk lives — test it directly:

```ts
import { mergeTranslationIntoPayload } from "./promote.js";

const LIVE = {
  title: { en: "Shop" },
  languages: { en: "English body" },
  quiz: [{ question: { en: "Q?" }, options: [{ en: "A" }, { en: "B" }, { en: "C" }], answerIndex: 0 }]
};

test("merge sets only the target language, preserving English", () => {
  const draft = { title: "Ahia", body: "Igbo body", quiz: [{ question: "Q-ig", options: ["A-ig", "B-ig", "C-ig"] }] };
  const merged = mergeTranslationIntoPayload(LIVE, "ig", draft);
  assert.deepEqual(merged.title, { en: "Shop", ig: "Ahia" });
  assert.equal(merged.languages.ig, "Igbo body");
  assert.equal(merged.languages.en, "English body"); // untouched
  assert.deepEqual(merged.quiz[0].options[0], { en: "A", ig: "A-ig" });
  assert.equal(merged.quiz[0].answerIndex, 0); // never touched
});

test("a question with any null option keeps ALL its options English", () => {
  // The answerIndex integrity rule at promotion time: partial = none.
  const draft = { quiz: [{ question: "Q-ig", options: ["A-ig", null, "C-ig"] }] };
  const merged = mergeTranslationIntoPayload(LIVE, "ig", draft);
  // options[*].ig must be ABSENT for every option in this question.
  assert.equal("ig" in (merged.quiz[0].options[0] as object), false);
  assert.equal("ig" in (merged.quiz[0].options[2] as object), false);
});

test("merge never changes the option array length or order", () => {
  const draft = { quiz: [{ options: ["A-ig", "B-ig", "C-ig"] }] };
  const merged = mergeTranslationIntoPayload(LIVE, "ig", draft);
  assert.equal(merged.quiz[0].options.length, 3);
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `mergeTranslationIntoPayload` (pure)** plus `promoteDraft(actor, draftId)` which:
  1. loads the draft; refuses unless `status === "approved"`;
  2. loads the content document's **current published** payload and its version list;
  3. **conflict check** — if the document has an existing `draft` version that is not one this promotion created, throw `"This lesson has unpublished changes; publish or discard them before promoting a translation."` (do not clobber);
  4. `mergeTranslationIntoPayload(publishedPayload, language, draftPayload)`;
  5. `updateDraft(actor, documentId, { payload: merged, changeSummary: "Promote {lang} translation" })`;
  6. `publishDocument(actor, documentId, { expectedDraftVersionId: <the draft just created>, publishNote })` — the `expectedDraftVersionId` is the atomic guard: if anything raced us, publish fails rather than shipping the wrong payload;
  7. `setStatus(draftId, "promoted")`.

  Note the staleness check is Task 11 (optional). Without it, promotion still works; it just doesn't warn when English moved.

- [ ] **Step 4: Run to verify pass; typecheck.**

- [ ] **Step 5: Commit** — `feat(translation): conflict-aware per-language promotion into live content`

---

## Task 9: Admin routes

**Files:**
- Create: `backend/src/routes/translation.ts`
- Modify: `backend/src/routes/integrations-admin.ts` (add `POST /translation/test`)
- Modify: `backend/src/app.ts` (mount the router under `/api/admin/translation`, gated by `authenticateJwt` + `requireRoles` on mutations — copy the gating from `admin.ts`)
- Test: `backend/src/routes/translation.test.ts`

Endpoints: `GET /` (list drafts + per-lesson status), `POST /run` (`{ documentIds | "all", language }` → runner), `GET /:documentId/:language` (one draft for review), `PUT /:documentId/:language` (save reviewer edits), `POST /:documentId/:language/approve`, `POST /:documentId/:language/promote`. Add `POST /translation/test` to `integrations-admin.ts` mirroring `/payouts/test`, calling `verifyTranslationConfig`.

- [ ] **Step 1: Write the failing test** — auth gating (401 without a token), and that `POST /run` with an unsupported provider/language pairing is rejected (e.g. `igbo_api` for `pcm`) using `providersSupporting`. Guard DB-touching tests with `skipWithoutDb`.

- [ ] **Steps 2–4:** Implement, following `backend/src/routes/admin.ts` for the auth/role pattern and error handling. Typecheck + tests.

- [ ] **Step 5: Commit** — `feat(translation): admin routes for run / review / approve / promote + test connection`

---

## Task 10: Translations tab + review workspace (UI)

**Files:**
- Modify: `dashboard/components/integration/types.ts` — `TranslationIntegrationForm` + empty factory
- Modify: `dashboard/components/integration/IntegrationConfigDrawer.tsx` — provider-per-language selects + three key fields + `dailyRequestLimit`
- Modify: `dashboard/components/integration/IntegrationSettingsWorkspace.tsx` — register the **Translations** provider tab immediately after **Payouts**
- Create: `dashboard/components/translation/TranslationReviewWorkspace.tsx` — the draft list (per lesson × language, with status + stale/over-budget badges) and the per-lesson review panel
- Create: `dashboard/app/previews/components/TranslationReviewPreview.tsx` + register in the previews page
- Modify: `dashboard/lib/admin/api.ts` + `contracts.ts` — client functions + types

The tab itself mirrors the Payouts tab exactly — read `IntegrationSettingsWorkspace.tsx` around the payouts registration and the `PayoutsProviderSelector`/`PayoutsCredentialFields` components; replicate that structure for translation settings and the Test Connection button (which hits `/translation/test`).

The review panel **reuses the gauges**: import `composeLessonBody` / `composeQuizQuestion` from `dashboard/lib/whatsapp-constraints.ts` and `ConstraintMeter` from the UI library, exactly as `ConfigEditorDrawer` does, so the reviewer sees the same green/yellow/red budget on every translated string. Over-budget options render red; the "Run" and "Approve"/"Promote" actions call the Task 9 routes.

- [ ] **Step 1:** Add the form type + config drawer fields; `cd dashboard && npm run typecheck`.
- [ ] **Step 2:** Register the tab after Payouts; verify it appears and Test Connection calls the endpoint (browser: `preview_start`, navigate, confirm via network request — the settings page needs admin auth, so verify the provider-settings drawer through a preview entry rather than the live route).
- [ ] **Step 3:** Build `TranslationReviewWorkspace` + its preview entry; verify all states (no drafts, machine_draft, in_review, over-budget option red, stale badge) render on `/previews/components`.
- [ ] **Step 4:** Wire the API client; typecheck both packages.
- [ ] **Step 5: Commit** — `feat(admin): Translations tab after Payouts + review workspace with gauges`

---

## Task 11 (OPTIONAL — cut cleanly if descoped): staleness flag

**Files:**
- Modify: `backend/src/translation/promote.ts` (warn on hash mismatch)
- Modify: `backend/src/routes/config-admin.ts` (mark drafts stale when English republishes)
- Test: extend `promote.test.ts`

When a content document is republished, compare its new `hashSource` against each `translation_drafts.sourceHash` for that document; where they differ, the translation is now of outdated English. Surface it two ways: `promoteDraft` refuses (or warns, per the UI affordance) when the live English no longer matches the draft's `sourceHash`; and the review list shows a **"English changed"** badge. This is the insurance against silent drift described in the spec; the feature is fully functional without it.

- [ ] Implement the hash comparison in `promoteDraft` (throw `"The English has changed since this was translated — re-run before promoting."` on mismatch) with a test, then the list badge. Commit — `feat(translation): flag translations whose English source has changed`

---

## Task 12: Docs + tracking + merge

- [ ] Update `task-list.md` (a Translations section: what shipped, the 500-vs-2500 open question, English-length prerequisite, Task 11 status).
- [ ] Append a `handoff.md` entry: the per-language provider rationale, the answerIndex positional guarantee, the conflict-aware promotion, and the human-review gate.
- [ ] `.env.example`: note `GEMINI_API_KEY` / Igbo API key live in the integration config (Secret Manager for real keys), not env.
- [ ] Merge `feat/translation-provider-adapter` → `main`, deploy backend, confirm `/ready` and no `translation_drafts` bootstrap errors in logs.

---

## Verification before completion

- [ ] `cd backend && npm run typecheck` and `cd dashboard && npm run typecheck` → exit 0
- [ ] `cd backend && npx tsx --test "src/translation/**/*.test.ts" src/config-platform/*.test.ts` → all pass
- [ ] The pre-existing `webhook.test.ts` (5) and `admin-auth.test.ts` (6) DB-dependent failures are unchanged — verify against the base commit, do not "fix"
- [ ] Manual, staging, with a real Gemini key on ONE lesson: run → draft appears with gauges → edit an over-budget option to green → approve → promote → confirm the content document's `languages.ig` (or quiz `ig` variants) now hold the reviewed text and English is untouched → the bot renders Igbo for an `ig` learner
- [ ] Manual: run the SAME lesson again → the reviewed draft is **not** overwritten
- [ ] Manual: leave an unrelated English edit as a pending draft on a lesson, then promote its translation → promotion **refuses** rather than shipping the English

## Deployment note

Backward compatible: the integration union gains a member, and a new table bootstraps idempotently. No existing document changes shape. The Igbo API daily cap is configuration; set it to the operator's real limit (500 or 2,500) in the Translations tab before the first bulk run. **Shorten the 27 over-limit English lessons before bulk-translating** — translations inherit and worsen the overflow.
