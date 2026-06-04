# State-Selection Onboarding + Live WhatsApp Sender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WhatsApp List-Message "select your state" onboarding step (admin-managed `bot.state_options`, seeded Anambra/Delta) that persists to `users.location`, and build the bot's first live Meta Cloud API outbound sender gated by the published WhatsApp config.

**Architecture:** A new `sender.ts` builds and POSTs text/button/list messages to Meta `/messages`, no-op when no config is published. The handler gains an `awaiting_state` step that emits a `list` reply (new optional field on the transition result) and persists the choice. The webhook delivers via the sender only when the request is NOT marked as sandbox (`X-SheTrades-Source` header). The sandbox simulator marks its calls and renders list rows as chips.

**Tech Stack:** TypeScript / Node 24 / Express 5 / Prisma 7 / Zod 4 / `node:test` via tsx / Next.js 16 dashboard.

---

## Spec Reference

Implements [`docs/superpowers/specs/2026-06-04-state-onboarding-and-whatsapp-sender-design.md`](../specs/2026-06-04-state-onboarding-and-whatsapp-sender-design.md). Re-read §3 (flow), §4 (reply shape), §5 (sender + sandbox gating) before starting.

## Task Order Summary

| # | Task |
|---|---|
| 1 | `sender.ts` Meta outbound sender + tests |
| 2 | `WhatsAppListSpec` type + reply-shape plumbing + session `location` persist/load |
| 3 | `awaiting_state` conversation flow in the handler |
| 4 | Webhook deliver-gating via `X-SheTrades-Source` + sender wiring |
| 5 | `bot.state_options` idempotent seed |
| 6 | Sandbox simulator: header, list-chip rendering, location diagnostic |
| 7 | Verification + handoff + deploy + seed run |

---

## Task 1: WhatsApp outbound sender

**Files:**
- Create: `backend/src/whatsapp/sender.ts`
- Create: `backend/src/whatsapp/sender.test.ts`

### Step 1: Write the tests `backend/src/whatsapp/sender.test.ts`

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { sendWhatsAppMessage, type OutboundReply } from "./sender.js";
import * as runtimeConfig from "../config-platform/runtime-config.js";

const realCfg = runtimeConfig.getRuntimeWhatsAppConfig;

function stubConfig(cfg: unknown) {
  (runtimeConfig as unknown as { getRuntimeWhatsAppConfig: () => unknown }).getRuntimeWhatsAppConfig = () => cfg;
}
function restoreConfig() {
  (runtimeConfig as unknown as { getRuntimeWhatsAppConfig: typeof realCfg }).getRuntimeWhatsAppConfig = realCfg;
}

function stubFetch(status = 200, body: unknown = { messages: [{ id: "wamid.1" }] }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

const cfg = { accessToken: "tok", phoneNumberId: "pn1", apiVersion: "v23.0" };

test("no-op (no fetch) when no WhatsApp config is published", async () => {
  stubConfig(null);
  let fetched = false;
  globalThis.fetch = (async () => { fetched = true; return new Response("{}"); }) as typeof fetch;
  await sendWhatsAppMessage("+234800", { text: "hi" });
  assert.equal(fetched, false);
  restoreConfig();
});

test("sends a text message to the correct URL with bearer auth", async () => {
  stubConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "hello" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://graph.facebook.com/v23.0/pn1/messages");
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get("authorization"), "Bearer tok");
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.messaging_product, "whatsapp");
  assert.equal(sent.to, "+234800");
  assert.equal(sent.type, "text");
  assert.equal(sent.text.body, "hello");
  restoreConfig();
});

test("sends interactive buttons (max 3, reply shape)", async () => {
  stubConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "pick", buttons: ["A", "B", "C", "D"] });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "interactive");
  assert.equal(sent.interactive.type, "button");
  assert.equal(sent.interactive.action.buttons.length, 3);
  assert.equal(sent.interactive.action.buttons[0].type, "reply");
  assert.equal(sent.interactive.action.buttons[0].reply.title, "A");
  restoreConfig();
});

test("sends an interactive list", async () => {
  stubConfig(cfg);
  const calls = stubFetch();
  const reply: OutboundReply = {
    text: "Which state?",
    list: { button: "Choose state", sections: [{ title: "States", rows: [{ id: "anambra", title: "Anambra" }, { id: "delta", title: "Delta" }] }] }
  };
  await sendWhatsAppMessage("+234800", reply);
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.interactive.type, "list");
  assert.equal(sent.interactive.body.text, "Which state?");
  assert.equal(sent.interactive.action.button, "Choose state");
  assert.equal(sent.interactive.action.sections[0].rows.length, 2);
  assert.equal(sent.interactive.action.sections[0].rows[1].title, "Delta");
  restoreConfig();
});

test("truncates over-long button and row titles", async () => {
  stubConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "x", buttons: ["A".repeat(40)] });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.ok(sent.interactive.action.buttons[0].reply.title.length <= 20);
  restoreConfig();
});

test("does not throw on non-2xx", async () => {
  stubConfig(cfg);
  stubFetch(500, { error: "boom" });
  await sendWhatsAppMessage("+234800", { text: "hi" }); // must resolve, not reject
  restoreConfig();
});
```

### Step 2: Run tests, confirm they fail

Run: `npx tsx --test backend/src/whatsapp/sender.test.ts`
Expected: FAIL (`Cannot find module './sender.js'`).

### Step 3: Create `backend/src/whatsapp/sender.ts`

```ts
import { getRuntimeWhatsAppConfig } from "../config-platform/runtime-config.js";

export type WhatsAppListSpec = {
  button: string;
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>;
};

export type OutboundReply = {
  text: string;
  buttons?: string[];
  list?: WhatsAppListSpec;
};

const BUTTON_TITLE_MAX = 20;
const ROW_TITLE_MAX = 24;

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function buildMessage(to: string, reply: OutboundReply): Record<string, unknown> {
  if (reply.list) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: reply.text },
        action: {
          button: clip(reply.list.button, BUTTON_TITLE_MAX),
          sections: reply.list.sections.map((s) => ({
            ...(s.title ? { title: clip(s.title, ROW_TITLE_MAX) } : {}),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: clip(r.title, ROW_TITLE_MAX),
              ...(r.description ? { description: r.description } : {})
            }))
          }))
        }
      }
    };
  }
  if (reply.buttons && reply.buttons.length > 0) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: reply.text },
        action: {
          buttons: reply.buttons.slice(0, 3).map((b, i) => ({
            type: "reply",
            reply: { id: String(i + 1), title: clip(b, BUTTON_TITLE_MAX) }
          }))
        }
      }
    };
  }
  return { messaging_product: "whatsapp", to, type: "text", text: { body: reply.text } };
}

export async function sendWhatsAppMessage(to: string, reply: OutboundReply): Promise<void> {
  const cfg = getRuntimeWhatsAppConfig();
  if (!cfg) {
    console.log(JSON.stringify({ event: "whatsapp.send.skipped", reason: "no_published_config", to }));
    return;
  }
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const message = buildMessage(to, reply);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(JSON.stringify({ event: "whatsapp.send.failed", to, status: response.status, detail: detail.slice(0, 300) }));
      return;
    }
    console.log(JSON.stringify({ event: "whatsapp.send.ok", to, type: (message as { type?: string }).type }));
  } catch (error) {
    console.warn(JSON.stringify({ event: "whatsapp.send.failed", to, reason: error instanceof Error ? error.message : String(error) }));
  }
}
```

### Step 4: Run tests, confirm they pass

Run: `npx tsx --test backend/src/whatsapp/sender.test.ts`
Expected: 6 pass.

### Step 5: Commit

```bash
git add backend/src/whatsapp/sender.ts backend/src/whatsapp/sender.test.ts
git commit -m "feat(whatsapp): live Meta Cloud API outbound sender (text/button/list)"
```

---

## Task 2: Reply-shape plumbing + session location

**Files:**
- Modify: `backend/src/whatsapp/handler.ts`

### Step 1: Add `list` to the transition result type and webhook result

In `backend/src/whatsapp/handler.ts`, import the list type and extend the result types.

Add the import near the top (with the other config-platform imports):
```ts
import type { WhatsAppListSpec } from "./sender.js";
```

Find the `WhatsAppWebhookResult` union's `"processed"` member (it has `reply: string; buttons?: string[]`). Add `list?: WhatsAppListSpec;` to it:
```ts
  | {
      status: "processed";
      phone: string;
      messageId: string;
      state: ConversationState;
      reply: string;
      buttons?: string[];
      list?: WhatsAppListSpec;
    };
```

Find the `transition` function's return type annotation `: { state: ConversationState; reply: string; buttons?: string[] }` and add `list?: WhatsAppListSpec`:
```ts
function transition(
  session: UserSession,
  text: string
): { state: ConversationState; reply: string; buttons?: string[]; list?: WhatsAppListSpec } {
```

### Step 2: Add `location` to the session type and the conversation state

Find `export type ConversationState = "awaiting_name" | "awaiting_language" | "main_menu" | "module_menu";` and add `"awaiting_state"`:
```ts
export type ConversationState = "awaiting_name" | "awaiting_language" | "awaiting_state" | "main_menu" | "module_menu";
```

Find the `UserSession` type and add a transient `location`:
```ts
  location?: string;
```
(Place it near `name`/`language`.)

### Step 3: Load + persist `location`

In `getOrCreateSession`, in the branch that maps an existing `user` + `user.session` into a `UserSession` (where it sets `s.name`, `s.language`), add after `if (user.language) s.language = ...`:
```ts
    if (user.location) s.location = user.location;
```
(Do the same in the other two return branches that build a session from a user, if they reference user fields — add `if (user.location) s.location = user.location;` / `if (createdUser.location) s2.location = createdUser.location;` where the corresponding user object is in scope.)

In `saveSession`, the `prisma.user.update({ data: { name, language, status, session: {...} } })` call — add `location` to the top-level user data:
```ts
      location: session.location || null,
```
(Place it alongside `name: session.name || null,`.)

In `getWhatsAppSession`, add `location` to the returned object:
```ts
    location: user.location || undefined,
```

### Step 4: Typecheck

Run: `npm run typecheck -w @shetrades/backend`
Expected: 0 errors.

### Step 5: Commit

```bash
git add backend/src/whatsapp/handler.ts
git commit -m "feat(whatsapp): add list reply field, awaiting_state state, and session location plumbing"
```

---

## Task 3: awaiting_state conversation flow

**Files:**
- Modify: `backend/src/whatsapp/handler.ts`

### Step 1: Add a state-options resolver helper

Near `toLanguage`/`languageLabel` in `handler.ts`, add a helper that reads the option set with a fallback. The `OptionItem` shape from `getRuntimeOptionSet` is `{ id, value, label, enabled, sortOrder, metadata }`.

```ts
type StateRow = { id: string; title: string };

function getStateRows(): StateRow[] {
  const configured = getRuntimeOptionSet("bot.state_options")
    .filter((item) => item.enabled)
    .map((item) => ({ id: item.value.trim().toLowerCase(), title: item.label.trim() }))
    .filter((r) => r.id.length > 0 && r.title.length > 0);
  if (configured.length > 0) return configured;
  // Resilience fallback so onboarding works before bot.state_options is seeded.
  return [
    { id: "anambra", title: "Anambra" },
    { id: "delta", title: "Delta" }
  ];
}

function resolveState(input: string, rows: StateRow[]): StateRow | null {
  const norm = input.trim().toLowerCase();
  // 1-based position number (basic-phone keypad users typing a digit)
  const asNum = Number(norm);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= rows.length) {
    return rows[asNum - 1] ?? null;
  }
  return rows.find((r) => r.id === norm || r.title.trim().toLowerCase() === norm) ?? null;
}

function buildStateListReply(lang: "en" | "pcm" | "ig", rows: StateRow[]) {
  let reply = getPrompt("state_prompt", lang, "Which state are you in?") + "\n";
  rows.forEach((r, i) => {
    reply += `${i + 1}. ${r.title}\n`;
  });
  return {
    reply,
    list: {
      button: getPrompt("state_button", lang, "Choose state"),
      sections: [{ title: "States", rows: rows.map((r) => ({ id: r.id, title: r.title })) }]
    }
  };
}
```

### Step 2: Add the `state_prompt` and `state_button` entries to `getPrompt`

In the `prompts` dictionary inside `getPrompt`, add:
```ts
    "state_prompt": {
      en: "Which state are you in?",
      pcm: "Which state you dey?",
      ig: "Kedu steeti ị nọ?"
    },
    "state_button": {
      en: "Choose state",
      pcm: "Choose state",
      ig: "Họrọ steeti"
    },
```

### Step 3: Route language → awaiting_state

In the `awaiting_language` branch, find the success path that currently sets `session.state = "main_menu"` and returns the main menu (after a valid `language` is resolved). Replace that success return so it goes to `awaiting_state` and sends the state list:

```ts
    session.language = language;
    session.state = "awaiting_state";
    session.lastUpdatedAt = nowIso();
    const stateRows = getStateRows();
    const stateList = buildStateListReply(language, stateRows);
    return {
      state: session.state,
      reply: stateList.reply,
      list: stateList.list
    };
```
(IMPORTANT: read the current `awaiting_language` success block first; preserve any language-set side effects, just change the destination state + returned reply from the main menu to the state list. The main-menu welcome now happens after state selection in Step 4.)

### Step 4: Handle the `awaiting_state` state

Add a new branch AFTER the `awaiting_language` block and BEFORE the global MENU handling (so a learner in `awaiting_state` is handled here). Use the existing `mainMenuText(session.name ...)` helper for the welcome:

```ts
  if (session.state === "awaiting_state") {
    const rows = getStateRows();
    const chosen = resolveState(normalized, rows);
    if (!chosen) {
      const list = buildStateListReply(lang, rows);
      return {
        state: "awaiting_state",
        reply: "Please choose your state from the list.\n" + list.reply,
        list: list.list
      };
    }
    session.location = chosen.title;
    session.state = "main_menu";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: mainMenuText(session.name ?? "Learner"),
      buttons: ["1. Start Learning", "2. My Progress", "3. Change Language"]
    };
  }
```
(`lang` is the local `const lang = session.language || "en";` already computed at the top of `transition`. Confirm it exists; if not, use `session.language || "en"`.)

### Step 5: Typecheck

Run: `npm run typecheck -w @shetrades/backend`
Expected: 0 errors.

### Step 6: Commit

```bash
git add backend/src/whatsapp/handler.ts
git commit -m "feat(whatsapp): state-selection onboarding step with List Message and config-managed states"
```

---

## Task 4: Webhook deliver-gating + sender wiring

**Files:**
- Modify: `backend/src/whatsapp/handler.ts` (handleWhatsAppWebhook signature + send)
- Modify: `backend/src/routes/webhook.ts`
- Modify: `backend/src/routes/webhook.test.ts`

### Step 1: Write/extend the webhook test `backend/src/routes/webhook.test.ts`

Add a test that the sandbox header suppresses delivery. Since the real send goes through `sendWhatsAppMessage` (which no-ops without a published config), the cleanest assertion is via a spy. Add:

```ts
import * as sender from "../whatsapp/sender.js";

test("POST /webhook/whatsapp does NOT deliver when marked as sandbox", async () => {
  let sendCount = 0;
  const orig = sender.sendWhatsAppMessage;
  (sender as unknown as { sendWhatsAppMessage: typeof orig }).sendWhatsAppMessage = async () => { sendCount += 1; };
  await request(app)
    .post("/webhook/whatsapp")
    .set("X-SheTrades-Source", "sandbox")
    .send(makeWebhookPayload("m-sandbox-1", "+234999000111", "hi"));
  assert.equal(sendCount, 0);
  (sender as unknown as { sendWhatsAppMessage: typeof orig }).sendWhatsAppMessage = orig;
});

test("POST /webhook/whatsapp delivers when NOT marked as sandbox", async () => {
  let sendCount = 0;
  const orig = sender.sendWhatsAppMessage;
  (sender as unknown as { sendWhatsAppMessage: typeof orig }).sendWhatsAppMessage = async () => { sendCount += 1; };
  await request(app)
    .post("/webhook/whatsapp")
    .send(makeWebhookPayload("m-real-1", "+234999000222", "hi"));
  assert.equal(sendCount, 1);
  (sender as unknown as { sendWhatsAppMessage: typeof orig }).sendWhatsAppMessage = orig;
});
```
(These hit Postgres via the handler's session read/write; in CI they run green. The assertion of interest is the send-count gating. If `makeWebhookPayload` is not already a helper in this test file, reuse the existing payload-builder in the file or inline the standard `{ entry: [{ changes: [{ value: { messages: [{ id, from, text: { body } }] } }] }] }` shape.)

### Step 2: Run, confirm fail

Run: `npx tsx --test backend/src/routes/webhook.test.ts`
Expected: the two new tests fail (delivery not wired / signature mismatch). (DB-dependent — may error on Postgres locally; that's fine, the wiring is the point.)

### Step 3: Update `handleWhatsAppWebhook` in `backend/src/whatsapp/handler.ts`

Add the import:
```ts
import { sendWhatsAppMessage } from "./sender.js";
```

Change the signature and add the delivery call after `saveSession`:
```ts
export async function handleWhatsAppWebhook(
  payload: unknown,
  opts: { deliver?: boolean } = {}
): Promise<WhatsAppWebhookResult> {
  // ... existing body unchanged up to and including: await saveSession(inbound.from, existingSession);
  // ... and the analytics recording ...

  if (opts.deliver) {
    await sendWhatsAppMessage(inbound.from, {
      text: result.reply,
      ...(result.buttons ? { buttons: result.buttons } : {}),
      ...(result.list ? { list: result.list } : {})
    });
  }

  return {
    status: "processed",
    phone: inbound.from,
    messageId: inbound.id,
    state: result.state,
    reply: result.reply,
    ...(result.buttons ? { buttons: result.buttons } : {}),
    ...(result.list ? { list: result.list } : {})
  };
}
```
(Read the existing function body and insert the `opts.deliver` send block after the session is saved and BEFORE the final return; also add `list` to the returned object. Keep the `duplicate`/`ignored` early returns unchanged — those do not deliver.)

### Step 4: Update `backend/src/routes/webhook.ts`

Change the POST handler to compute `deliver` from the header:
```ts
webhookRouter.post("/whatsapp", async (req, res, next) => {
  try {
    const isSandbox = req.header("X-SheTrades-Source") === "sandbox";
    const result = await handleWhatsAppWebhook(req.body, { deliver: !isSandbox });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
```

### Step 5: Run tests, confirm pass

Run: `npx tsx --test backend/src/routes/webhook.test.ts`
Expected: the two new send-gating tests pass (in a Postgres-backed env).

### Step 6: Typecheck + commit

Run: `npm run typecheck -w @shetrades/backend` (0 errors)
```bash
git add backend/src/whatsapp/handler.ts backend/src/routes/webhook.ts backend/src/routes/webhook.test.ts
git commit -m "feat(whatsapp): deliver replies via Meta sender unless request is sandbox-marked"
```

---

## Task 5: `bot.state_options` seed

**Files:**
- Create: `backend/src/config-platform/seed-state-options.ts`
- Modify: `backend/package.json` (add a `seed:state-options` script)

### Step 1: Read an existing seed for the pattern

Read `backend/src/config-platform/seed-admin-ui-copy.ts` (or whichever seed module exists) to copy: how it constructs the config service, creates/updates a document, and publishes it. Mirror that exact flow.

### Step 2: Create `backend/src/config-platform/seed-state-options.ts`

Following the existing seed's structure (service construction + create-or-update + publish), seed an `options`-namespace, `option_set`-type document at key `bot.state_options` with payload:
```ts
const payload = {
  title: "States",
  items: [
    { id: "anambra", value: "Anambra", label: "Anambra", enabled: true, sortOrder: 1, metadata: {} },
    { id: "delta", value: "Delta", label: "Delta", enabled: true, sortOrder: 2, metadata: {} }
  ]
};
```
Make it idempotent: if the document already exists, update its draft and publish; otherwise create + publish. (Copy the create-or-update branch logic from the reference seed.) Log the result. Guard on `process.env.POSTGRES_URL` being set (skip with a message if not), matching the other seeds.

### Step 3: Add the script to `backend/package.json`

In `scripts`, add:
```json
"seed:state-options": "tsx src/config-platform/seed-state-options.ts"
```

### Step 4: Typecheck

Run: `npm run typecheck -w @shetrades/backend`
Expected: 0 errors. (The seed actually runs against Postgres in Task 7 on staging; locally just typecheck.)

### Step 5: Commit

```bash
git add backend/src/config-platform/seed-state-options.ts backend/package.json
git commit -m "feat(config): idempotent seed for bot.state_options (Anambra, Delta)"
```

---

## Task 6: Sandbox simulator updates

**Files:**
- Modify: `dashboard/components/integration/WhatsAppSandboxSimulator.tsx`

### Step 1: Read the simulator

Read `dashboard/components/integration/WhatsAppSandboxSimulator.tsx`. Note: the `POST /webhook/whatsapp` fetch (around line 132), how it parses the result `{ reply, buttons }`, how it renders `buttons` as chips, and the diagnostics panel that shows session fields.

### Step 2: Add the sandbox marker header

On the `POST /webhook/whatsapp` fetch call, add the header so the backend suppresses real delivery:
```ts
const res = await fetch(`${ADMIN_CONFIG_API_BASE_URL}/webhook/whatsapp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-SheTrades-Source": "sandbox" },
  body: JSON.stringify(payload)
});
```
(Preserve the existing body/headers; just add the `X-SheTrades-Source` header and keep `Content-Type`.)

### Step 3: Render list rows as chips

Where the component reads `result.buttons` to render tappable chips, also handle `result.list`: when `result.list` is present, render each `result.list.sections[*].rows[*]` as a chip whose click sends the row `title` as the next message (same handler the buttons use). A row tap should call the same send function with the row title. Keep buttons rendering unchanged; add list rows as an additional chip group (e.g. prefixed with the section title).

### Step 4: Show location in diagnostics

In the active-session diagnostics panel (which already shows state/language/name), add a "State / Location" row displaying `session.location` (the `getWhatsAppSession` response now includes `location`). If absent, show "—".

### Step 5: Build

Run: `npm run build -w @shetrades/dashboard`
Expected: build succeeds.

### Step 6: Commit

```bash
git add dashboard/components/integration/WhatsAppSandboxSimulator.tsx
git commit -m "feat(sandbox): mark sandbox calls, render List Message rows as chips, show location"
```

---

## Task 7: Verification + handoff + deploy

**Files:**
- Modify: `handoff.md`
- Modify: `task-list.md`

### Step 1: Full verification

Run: `npm run typecheck` (all workspaces 0 errors)
Run: `npm run build -w @shetrades/dashboard` (success)
Run: `npx tsx --test backend/src/whatsapp/sender.test.ts` (6 pass — DB-free)

### Step 2: Update `handoff.md`

Add a `### 2026-06-04: State onboarding + live WhatsApp sender` entry summarizing: the `awaiting_state` step (List Message, `bot.state_options` seeded Anambra/Delta + fallback), `users.location` persistence, the `sender.ts` Meta outbound sender (gated by published config, no-op otherwise), the webhook deliver-gating via `X-SheTrades-Source`, and the sandbox updates. Note the deploy + seed run requirements and that the Anambra/Delta analytics breakdowns now populate as learners select states.

### Step 3: Update `task-list.md`

Mark the state-onboarding + sender work complete with a one-line summary.

### Step 4: Commit docs

```bash
git add handoff.md task-list.md
git commit -m "docs: log state onboarding + live WhatsApp sender in handoff and task list"
```

### Step 5: Deploy backend to staging

Run:
```bash
gcloud run deploy shetrades-backend-staging --source . --region us-central1 --env-vars-file cloudrun-staging-env.yaml --update-secrets PAYOUTS_WORKER_TOKEN=payouts-worker-token:latest --quiet
```
Expected: new revision serving 100%.

### Step 6: Seed the state options on staging

Run the seed against staging Postgres (the same way other seeds are run — with `POSTGRES_URL` and any `PG_SSL_*` from `cloudrun-staging-env.yaml` exported):
```bash
# from repo root, with staging POSTGRES_URL exported into the env:
npm run seed:state-options -w @shetrades/backend
```
Expected: a log line confirming `bot.state_options` was created/updated + published.

### Step 7: Smoke-verify on staging

Drive the sandbox (or curl the webhook with `X-SheTrades-Source: sandbox`) through name → language → and confirm the state List Message appears with Anambra/Delta, selecting one advances to the main menu, and `GET /webhook/whatsapp/session/<phone>` shows the chosen `location`. Confirm `GET /api/admin/users` shows the location for that learner.

---

## Self-Review

**Spec coverage:**
- §2.1 state option set → Task 5 (seed) + Task 3 (runtime read + fallback).
- §2.2 prompts → Task 3 (getPrompt entries).
- §2.3 fallback → Task 3 (`getStateRows` fallback).
- §3 flow (awaiting_state, transitions, returning-user skip, session persist/load) → Tasks 2 + 3.
- §4 reply shape (`WhatsAppListSpec`, `list` field) → Tasks 1 (type) + 2 (plumbing).
- §5 sender → Task 1; webhook gating + sandbox header → Task 4 + Task 6.
- §5.3 sandbox list rendering → Task 6.
- §7 testing → tests in Tasks 1, 4 + smoke in Task 7.
- §8 acceptance → Task 7 smoke verification.

**Placeholder scan:** No TBD/TODO. The seed (Task 5) and webhook test (Task 4) reference "the existing seed module" / "the existing payload-builder" — these point the engineer to copy a concrete in-repo pattern (`seed-admin-ui-copy.ts`, the `makeWebhookPayload` helper in `webhook.test.ts`), not to invent. DB-dependent tests are flagged as CI-run, consistent with the project's existing test situation.

**Type consistency:** `WhatsAppListSpec` defined once (Task 1, `sender.ts`), imported as a type in Task 2. `OutboundReply` from `sender.ts` used by Task 4's send call. `getStateRows`/`resolveState`/`buildStateListReply` defined and used within Task 3. `ConversationState` extended once (Task 2) and used in Task 3. `location` on `UserSession` consistent across Tasks 2 + 3.

**Ordering:** sender (1) → types/session (2) → flow (3) → webhook+send (4) → seed (5) → sandbox (6) → verify/deploy/seed-run (7). The `list` type exists before the handler imports it; the sender exists before the webhook wires it.
