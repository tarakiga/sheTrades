# State-Selection Onboarding + Live WhatsApp Sender — Design Spec

- **Status:** Approved (user approved the design). Pending implementation plan.
- **Date:** 2026-06-04
- **Owner:** AI Coding Agent
- **Related:** the location/Anambra-Delta context originates in `PRD.md` (User model `state: "anambra | delta"`).

## 1. Background and goals

The WhatsApp bot onboards learners as `awaiting_name → awaiting_language → main_menu`. It never captures the learner's **state (location)**, so `users.location` is null for real learners and the analytics funnel's Anambra/Delta breakdowns are always 0. Separately, the bot has **no live outbound sender**: `POST /webhook/whatsapp` computes a reply and returns it in the HTTP response (consumed by the dashboard sandbox simulator), but nothing is ever POSTed to Meta's Cloud API, so real WhatsApp users receive nothing.

### Goals

1. Add a **"select your state" onboarding step** between language selection and the main menu, rendered as a WhatsApp **List Message** (dropdown), with the state list stored as an **admin-managed config option set** seeded with **Anambra** and **Delta**.
2. Persist the chosen state to `users.location`.
3. Build the bot's **live Meta Cloud API outbound sender**, wired into the webhook, gated by the published WhatsApp integration config, leaving the sandbox path unchanged.

### Non-goals

- Translating state proper-nouns (Anambra/Delta stay as-is across languages).
- Backfilling location for learners onboarded before this change (they have no location until they re-onboard or an admin sets it; a returning learner who already has a location skips the step).
- Meta message types beyond text + interactive button + interactive list (no templates, media, flows).

## 2. Configuration & content (admin-managed)

### 2.1 State option set

A config-platform **option set** at key `bot.state_options` (`options` namespace, `option_set` type), seeded with two enabled items:

```json
{ "title": "States", "items": [
  { "id": "anambra", "value": "Anambra", "label": "Anambra", "enabled": true, "sortOrder": 1 },
  { "id": "delta",   "value": "Delta",   "label": "Delta",   "enabled": true, "sortOrder": 2 }
] }
```

Consumed at runtime via the existing `getRuntimeOptionSet("bot.state_options"): Array<OptionItem>` helper (same as `bot.language_options`). The runtime read returns only enabled items. Admins add/edit/reorder states from the existing Content/Options admin UI without a deploy. The seed mirrors how other `bot.*` option sets are seeded (the `category-option-set-seeds.ts` / admin-ui-copy seed pattern).

### 2.2 Prompt content

A new bot prompt for the step, added to the in-handler `getPrompt` dictionary (which already holds en/pcm/ig variants for other prompts), key `state_prompt`:
- en: "Which state are you in?"
- pcm: "Which state you dey?"
- ig: "Kedu steeti ị nọ?"

And the List Message's "button" label (the tap-to-open label), key `state_button`:
- en: "Choose state" / pcm: "Choose state" / ig: "Họrọ steeti"

(Defaults live in `getPrompt` like the rest; no separate config doc required, consistent with the other bot prompts.)

### 2.3 Resilience fallback

If `bot.state_options` is empty or unpublished, the handler falls back to a hardcoded `[{ id: "anambra", title: "Anambra" }, { id: "delta", title: "Delta" }]` so onboarding never breaks before the option set is seeded — exactly the dual config-plus-fallback pattern `toLanguage` already uses for languages.

## 3. Conversation flow

### 3.1 New state

Extend `ConversationState` with `"awaiting_state"`:
```
awaiting_name → awaiting_language → awaiting_state → main_menu
```

### 3.2 Transitions

- **awaiting_language (on valid language):** instead of going straight to `main_menu`, set `session.language`, transition to `awaiting_state`, and return the **state List Message** (body = `state_prompt` in the chosen language, action.button = `state_button`, rows = state options). The reply text also lists the states for keypad users.
- **awaiting_state (on reply):** resolve the inbound text/`list_reply` against the state options, matching (case-insensitive, trimmed) on the row **id**, the row **label**, OR the **1-based position number** in the list. The position number covers basic-phone learners who read the numbered list in the reply body and type a digit rather than tapping the List Message. If matched, set `session.location = <label>`, transition to `main_menu`, return the main-menu welcome. If not matched, re-send the state List Message with a short "please choose from the list" preface.
- **Returning learner:** `getOrCreateSession` loads `user.location` into `session.location`. A learner whose session resumes past onboarding is unaffected. A NEW learner with no location always sees the step. (We do not retro-insert the step for learners already past `awaiting_language` in a persisted session.)

### 3.3 Session + persistence

- `UserSession` gains a transient `location?: string`.
- `getOrCreateSession` reads `user.location` into `session.location`.
- `saveSession` writes `location: session.location ?? null` into the `prisma.user.update` data (alongside the existing name/language/status fields).
- `getWhatsAppSession` (the GET endpoint the sandbox polls) includes `location` so the sandbox diagnostics can show it.

## 4. Interactive reply shape

`transition()` currently returns `{ state, reply, buttons?: string[] }`. Add an optional `list`:

```ts
type WhatsAppListSpec = {
  button: string;
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>;
};

type TransitionResult = {
  state: ConversationState;
  reply: string;
  buttons?: string[];
  list?: WhatsAppListSpec;
};
```

Only the state step populates `list`; every other step keeps using `buttons`. `WhatsAppWebhookResult["processed"]` likewise gains an optional `list` so the HTTP response (and the sandbox) can render it.

## 5. Live Meta outbound sender

### 5.1 Module

New `backend/src/whatsapp/sender.ts`:

```ts
export type OutboundReply = { text: string; buttons?: string[]; list?: WhatsAppListSpec };
export async function sendWhatsAppMessage(to: string, reply: OutboundReply): Promise<void>;
```

Behavior:
1. `const cfg = getRuntimeWhatsAppConfig();` — if null (no published WhatsApp integration), **log a debug line and return** (no-op; nothing breaks).
2. Build the Meta request body by shape:
   - `reply.list` present → `{ type: "interactive", interactive: { type: "list", body: { text }, action: { button, sections } } }`.
   - else `reply.buttons?.length` (cap at 3, Meta's limit) → `{ type: "interactive", interactive: { type: "button", body: { text }, action: { buttons: buttons.slice(0,3).map((b,i)=>({ type:"reply", reply:{ id: String(i+1), title: b } })) } } }`.
   - else → `{ type: "text", text: { body: text } }`.
3. POST `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages` with headers `Authorization: Bearer ${cfg.accessToken}`, `Content-Type: application/json`, body `{ messaging_product: "whatsapp", to, ...message }`.
4. On non-2xx or thrown error: `console.warn(JSON.stringify({ event: "whatsapp.send.failed", to, status, reason }))` and return. **Never throw** — the webhook already acked Meta with 200; delivery is best-effort with logging.
5. On success: `console.log(JSON.stringify({ event: "whatsapp.send.ok", to, type }))`.

Reply-button titles are capped at WhatsApp's 20-char limit (truncate defensively); list row titles capped at 24 chars. The sender truncates rather than failing.

### 5.2 Webhook wiring + sandbox safety

`handleWhatsAppWebhook` gains an options arg: `handleWhatsAppWebhook(payload, opts?: { deliver?: boolean })`. When `opts.deliver` is true and the result is `processed`, it calls `sendWhatsAppMessage(inbound.from, { text: result.reply, buttons: result.buttons, list: result.list })` AFTER `saveSession`.

The webhook route decides `deliver`:
```ts
const isSandbox = req.header("X-SheTrades-Source") === "sandbox";
const result = await handleWhatsAppWebhook(req.body, { deliver: !isSandbox });
res.status(200).json(result);
```

The dashboard sandbox simulator adds `headers: { "X-SheTrades-Source": "sandbox" }` to its `POST /webhook/whatsapp` call, so sandbox testing never triggers a real Meta send and continues to read the reply (incl. `list`) from the HTTP response. Real Meta webhooks have no such header → they deliver.

### 5.3 Sandbox list rendering

The `WhatsAppSandboxSimulator` is extended so that when a bot reply includes `list`, it renders the list rows as tappable chips (same interaction as buttons — clicking a row sends its `title` back as the next message). This lets the state step be tested visually in the sandbox. Buttons rendering is unchanged.

## 6. Code layout

### New backend files
```
backend/src/whatsapp/sender.ts          # sendWhatsAppMessage + Meta request builders
backend/src/whatsapp/sender.test.ts     # stubbed-fetch unit tests
backend/src/config-platform/seed-state-options.ts  # idempotent seed for bot.state_options (or extend an existing seed module)
```

### Modified backend files
```
backend/src/whatsapp/handler.ts         # awaiting_state flow, list reply shape, location persistence, getOrCreateSession/saveSession/getWhatsAppSession
backend/src/routes/webhook.ts           # deliver gating via X-SheTrades-Source header
```

### Modified frontend files
```
dashboard/components/integration/WhatsAppSandboxSimulator.tsx  # send X-SheTrades-Source header; render list rows as chips; show location in diagnostics
```

## 7. Testing

| Layer | Tests |
|---|---|
| Sender | `sender.test.ts` (stub `fetch`): list payload shape + URL + Bearer; button payload (≤3, reply shape); text payload; no-op when `getRuntimeWhatsAppConfig()` is null; truncation of long titles; non-2xx logs and does not throw. |
| Handler flow | language→state emits a `list` with the seeded/fallback states; valid state selection sets `session.location` and advances to `main_menu`; invalid selection re-prompts with the list; returning user with `user.location` set skips the step. (DB-backed parts run in CI; pure-transition parts run locally.) |
| Webhook | with `X-SheTrades-Source: sandbox` the sender is NOT called; without it the sender IS called (mock `sendWhatsAppMessage`). |
| Seed | `bot.state_options` seed creates the two enabled items idempotently. |

## 8. Acceptance criteria

- A new learner messaging the bot goes name → language → **state (list of Anambra/Delta)** → main menu; choosing a state persists it to `users.location` (visible on `/users` and in the learner detail drawer).
- The state list is driven by `bot.state_options`; editing/adding a state in the admin UI changes the bot's list with no deploy; if the option set is absent the bot still shows Anambra/Delta via the fallback.
- With a published WhatsApp integration config, the bot's replies (text, buttons, and the state list) are delivered to real WhatsApp via Meta's `/messages` API; with no config published, the bot no-ops the send and logs (no crash).
- The sandbox simulator can drive the full flow including the state list, and never triggers a real Meta send.
- Once learners select states, the `/analytics` Anambra/Delta funnel breakdowns populate from real data.
- All new tests pass; backend typecheck and dashboard build pass.

## 9. Follow-ups (out of scope)

- Inbound Meta signature verification (`X-Hub-Signature-256` with appSecret) to harden the webhook against spoofing — currently the sandbox marker is a soft gate; a real Meta call without the marker delivers, which is correct, but signature verification would add authenticity.
- Backfill/admin-set location for pre-existing learners.
- Per-state reward amounts or content.
- Making the Anambra/Delta analytics breakdown regions admin-configurable (they remain config defaults in `admin/config.ts`).
