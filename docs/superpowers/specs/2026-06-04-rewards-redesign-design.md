# Rewards Page Redesign & Automated Payouts — Design Spec

- **Status:** Approved — pending user review of this written spec, then implementation plan.
- **Date:** 2026-06-04
- **Owner:** AI Coding Agent
- **Brainstorm session:** `.superpowers/brainstorm/1148-1780511250/`

## 1. Background and goals

The current `/rewards` page renders a generic 4-metric strip plus a flat table sourced from `admin_rewards_view`. It exposes nothing useful for the two real audiences (program managers needing a calm daily glance, finance/ops needing to *do work*), uses engineering jargon as section copy ("Exceptions", "Delivery Gaps", "Automation Health"), surfaces dead buttons ("Issue Manual Reward", "Open Reconciliation"), formats amounts as raw strings, hides timestamps, and offers no filtering, search, retry, or export. Crucially, **there is no automated issuance path**: the WhatsApp bot inserts `Pending` rewards, and they stay `Pending` forever because nothing dispatches them.

This spec redesigns the page in the spirit of Fortune 500 ops dashboards (Stripe / Brex / Mercury) and wires the full automated dispatch pipeline so the page reflects real production behaviour, not a stub.

### Goals

1. Make `/rewards` calm and scannable at a glance, and powerful for working sessions, on a single screen.
2. Replace engineering jargon with operator-friendly copy.
3. Make every visible affordance actually do something — no dead buttons.
4. Issue airtime rewards automatically from `Pending` rows through a configurable provider, with retry, idempotency, and observability.
5. Keep the provider choice admin-managed (per project data-driven UI rule), with sandbox support so staging exercises the same code paths without burning real airtime.

### Non-goals (v1)

- Per-module variable reward amounts (continue with `REWARD_DEFAULT_AMOUNT` env var; admin-managed amounts ship in a follow-up).
- Email / SMS alerts to admins on failures (out of scope; the in-page "Needs attention" panel is the v1 surface).
- Multi-currency support (NGN only; `defaults.currency` slot reserved for future).
- Onboarding step that captures `users.location` (separate feature; Anambra/Delta funnels stay 0 until that ships).

## 2. Architecture overview

Three surfaces change. They share one provider-adapter contract.

```
                    [ Admin opens /settings → Integration → Payouts ]
                                       │
                                       ▼
                       PayoutsIntegrationPayload  (config-platform doc
                       key = integration.payouts.primary, draft/publish)
                                       │
   ┌───────────────────────────────────┼───────────────────────────────────┐
   │                                   │                                   │
   ▼                                   ▼                                   ▼
 RewardsPage              Cloud Scheduler @ */5 min          POST /api/admin/rewards/:id/retry
 (consumes published      hits                               (admin-triggered, same code path)
  active provider for          POST /internal/payouts/dispatch
  the banner)                          │
                                       ▼
                              getActiveProvider(config)
                                       │
                                       ▼
                         [ africasTalking | termii | reloadly ]
                                       │
                                       ▼
                          provider.dispatch(reward, config)
                                       │
                       ┌───────────────┴───────────────┐
                       │                               │
                  ok → Issued                    err → retry up to 3x
                  + providerTxnId                with exponential backoff
                  + issuedAt                     then Failed + failureReason
```

The dashboard frontend talks only to backend admin endpoints, not directly to providers. The worker talks only to providers, not to the dashboard. Provider adapters are the single seam.

## 3. The `/rewards` page

### 3.1 Layout: hybrid health summary + working table

Three-zone page (top hero, middle toolbar, bottom table) following the option C wireframe selected in brainstorming.

#### 3.1.1 RewardsHealthHero (top, ~140px tall)

Three side-by-side panels, equal vertical rhythm:

- **IssuanceSuccessGauge** — SVG donut with three arcs (Issued / Pending / Failed); centred percentage shows `issued / (issued + pending + failed)`. Legend lists raw counts.
- **TotalPaidHeadline** — Big amount (`Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`) for the active date range, with a small "+12% vs previous period" delta. Period label below ("Last 7 days").
- **NeedsAttentionPanel** — At most 3 escalation items, sorted by severity. Examples: "3 failed in last 24h — Airtime gateway timeout", "12 pending >6h — Awaiting issuance worker". Each item is a clickable row that filters the table below to the relevant subset.

If no provider is configured, the entire hero is replaced by a single amber banner: *"Pending rewards will not dispatch until a payouts provider is configured. Set up provider →"* linking to `/settings → Integration → Payouts`.

#### 3.1.2 RewardsToolbar (middle)

Sticky horizontal strip:

- **StatusFilterTabs** — `All · Issued · Pending · Failed`. Default "All". Selecting any pill updates the URL query (`?status=Failed`) so deep links work.
- **DateRangePicker** — presets `Last 24h · Last 7 days (default) · Last 30 days · Custom…`. Custom opens a date range modal.
- **SearchInput** — debounced, queries learner name, learner phone, or module string.
- **ExportCsvButton** — POSTs filters to `GET /api/admin/rewards/export?...`, browser downloads result.

#### 3.1.3 RewardsTable (bottom)

Columns: `Learner` (name + masked phone), `Module`, `Amount` (currency-formatted), `Channel · When` (channel name + relative time), `Status` (coloured pill), inline action column (hover-revealed).

Row-hover inline actions are restricted by status:

| Status | Hover actions |
|---|---|
| Pending | Retry now · Mark Issued · Open |
| Failed  | Retry now · Open |
| Issued  | Open |

Clicking anywhere else on the row opens `RewardDetailDrawer`.

Server-side pagination via cursor; default page size 25, options 50 and 100. Sticky table header. Sticky learner column on mobile breakpoints.

#### 3.1.4 RewardDetailDrawer

Right-side slide-out (300–400ms ease) showing:

- Reward identity: learner full name, phone, module, currency-formatted amount, channel.
- Issuance timeline: created → first attempt → … → issued / failed.
- Provider transaction ID (when present).
- Failure reason (last error from provider, when present).
- Note from actor (when manually overridden).
- Action buttons: `Retry now`, `Mark Issued (with note)`, `Open learner` (links to `/users/<id>`).

#### 3.1.5 ManualRewardDrawer

Opens from the page-header `Issue Manual Reward` button. Fields: learner picker (autocomplete searching users), amount (defaults to the env default, editable), channel (defaults from active provider config), reason note (required, minimum 10 characters). On submit, POST `/api/admin/rewards/manual` which inserts a Reward row with `status: "Pending"` and `noteFromActor` set — the standard worker picks it up the next tick. No special manual path that could drift.

### 3.2 Copy

All admin-managed (config-platform), but with operator-friendly defaults baked in as React fallback strings:

| Old | New |
|---|---|
| "Reward Events" / "Coverage" | "Total rewards" / "All time" |
| "Issued" / "Fulfilled" | "Issued" (unchanged — already plain) |
| "Pending" / "Follow-up" | "Pending" / "Awaiting dispatch" |
| "Failed" / "Exceptions" | "Failed" / "Last 24h" |
| "Exceptions" card | (removed — surface absorbed into NeedsAttentionPanel) |
| "Delivery Gaps" card | (removed — same) |
| "Automation Health" card | (removed — replaced by the gauge) |
| "Open Reconciliation" | (button removed entirely — wasn't wired) |

### 3.3 Empty states

| Situation | Treatment |
|---|---|
| No rewards in DB at all | Onboarding card with illustration + copy "Rewards will appear here as learners finish modules." If no provider is active, add CTA "Set up provider →". |
| All rewards in date range = Issued | Green tick + "All caught up — last issuance N minutes ago." Table still shows the Issued rows. |
| Provider not configured | Amber banner (3.1.1) replaces hero. Table still loads but is read-only (Retry actions disabled with tooltip "No active provider"). |

### 3.4 Accessibility

- Status pills carry icon + colour, never colour alone.
- Donut arc colours pass WCAG AA against the panel background.
- Tab order: filters → search → table rows → drawer.
- All inline row actions reachable via `Enter` key after row focus.
- Date picker controllable via keyboard.

## 4. `/settings → Integration → Payouts` tab

### 4.1 Where it lives

New entry in the existing `IntegrationSettingsWorkspace` provider list, positioned **between Notification and any future provider**. Re-uses the existing draft/publish/rollback workflow, version history, and connection-test plumbing. No new shell.

### 4.2 Config document

Stored under `namespace=integration`, `key=integration.payouts.primary`. Payload shape:

```ts
type PayoutsIntegrationPayload = {
  provider: "africas_talking" | "termii" | "reloadly";  // exactly one active
  sandbox: boolean;                                      // applies to the selected provider
  africasTalking?: { username: string; apiKey: string };
  termii?:         { apiKey: string; senderId?: string };
  reloadly?:       { clientId: string; clientSecret: string };
  defaults: { currency: "NGN"; channel: "airtime" };     // forward-compat slot
};
```

Server-side and client-side validation via a shared Zod `discriminatedUnion("provider", [...])` so only the credential block matching `provider` is required.

### 4.3 Tab UX

- **PayoutsProviderSelector** — three radio cards (Africa's Talking · Termii · Reloadly), each with provider tagline and a `Sandbox mode` toggle that affects only that provider's base URL.
- **PayoutsCredentialFields** — discriminated form. Picking a provider radio swaps which credential set the form renders. Secrets use the existing `<PasswordField>` (show/hide, password-manager-ignore attributes already in place from the auth components).
- **Connection test** — re-uses `runConnectionTest` from `IntegrationSettingsWorkspace`. Each adapter exposes `verifyCredentials(config)` that hits the provider's account-status or balance endpoint. Result renders as `Healthy / Degraded / Failed` badge, identical to the WhatsApp tab.
- **Active indicator** — when a published doc exists, a green pill at the top reads e.g. *"Active: Africa's Talking · sandbox"*. When no provider is published, the `/rewards` page surfaces the amber banner from 3.1.1.

### 4.4 Sandbox behaviour

When `sandbox: true`, each adapter routes to the provider's sandbox base URL:

- Africa's Talking → `https://api.sandbox.africastalking.com`
- Termii → Termii's sandbox endpoint (separate base URL per Termii docs)
- Reloadly → `https://api.reloadly.com` with sandbox-flag credentials

Sandbox responses are treated identically to production: `Issued` rows still get a `providerTxnId` (the sandbox transaction reference), so the entire UI is auditable end-to-end without burning real airtime.

## 5. Provider adapter pattern

All adapters live in `backend/src/payouts/providers/`.

### 5.1 Contract

```ts
// backend/src/payouts/providers/contracts.ts
export type DispatchResult =
  | { ok: true;  providerTxnId: string;  issuedAt: Date }
  | { ok: false; reason: string;         retryable: boolean };

export interface PayoutProvider {
  readonly key: "africas_talking" | "termii" | "reloadly";
  verifyCredentials(config: PayoutsIntegrationPayload): Promise<ConnectionResult>;
  dispatch(reward: Reward, config: PayoutsIntegrationPayload): Promise<DispatchResult>;
}
```

### 5.2 Factory

```ts
// backend/src/payouts/providers/index.ts
export async function getActiveProvider(): Promise<{
  provider: PayoutProvider;
  config: PayoutsIntegrationPayload;
} | null> {
  const config = getRuntimeIntegrationConfig<PayoutsIntegrationPayload>(
    "integration.payouts.primary"
  );
  if (!config) return null;
  switch (config.provider) {
    case "africas_talking": return { provider: africasTalkingAdapter, config };
    case "termii":          return { provider: termiiAdapter, config };
    case "reloadly":        return { provider: reloadlyAdapter, config };
  }
}
```

The worker, the row-level `Retry now` admin endpoint, and the manual-reward drawer all call the same factory. No provider switch logic anywhere else. Adding a fourth provider later is one new file plus three lines here.

### 5.3 Retryable vs non-retryable classification

Adapters classify provider errors:

- **Retryable** — HTTP 5xx, connection reset, timeout, provider rate limit, sandbox-throttle.
- **Non-retryable** — HTTP 400 with explicit "invalid phone", "blocked recipient", "insufficient wallet balance".

The worker uses this flag to decide whether to bump `retryCount` (retryable) or jump straight to `status="Failed"` (non-retryable).

## 6. Issuance worker

### 6.1 Trigger

A Cloud Scheduler job `shetrades-payouts-dispatcher` HTTP-pings `POST /internal/payouts/dispatch` every 5 minutes. The endpoint requires header `X-Internal-Worker-Token: ${PAYOUTS_WORKER_TOKEN}` — secret stored in Secret Manager, mounted into Cloud Run via `--set-secrets`. External traffic without that header gets 403.

### 6.2 Dispatch loop (one tick)

```
1. const active = await getActiveProvider();
   if (!active) { record skip "no_active_provider"; return summary; }

2. const pending = await prisma.reward.findMany({
     where: {
       status: { in: ["Pending", "Failed"] },
       retryCount: { lt: 3 },
       OR: [
         { nextAttemptAt: null },
         { nextAttemptAt: { lte: new Date() } }
       ],
       attemptInProgress: false
     },
     orderBy: { createdAt: "asc" },
     take: 50
   });

3. for each reward (concurrency cap 5, p-limit):
     // Atomic claim — prevents overlapping ticks from double-dispatching.
     const claimed = await prisma.reward.updateMany({
       where: { id: reward.id, attemptInProgress: false },
       data: { attemptInProgress: true }
     });
     if (claimed.count === 0) continue;  // another tick won the race

     const result = await active.provider.dispatch(reward, active.config);

     if (result.ok) {
       await prisma.reward.update({
         where: { id: reward.id, status: { not: "Issued" } },
         data: {
           status: "Issued",
           issuedAt: result.issuedAt,
           providerTxnId: result.providerTxnId,
           attemptInProgress: false,
           failureReason: null
         }
       });
     } else if (result.retryable && reward.retryCount + 1 < 3) {
       const nextDelayMin = Math.pow(2, reward.retryCount) * 5; // 5, 10, 20 min
       await prisma.reward.update({
         where: { id: reward.id },
         data: {
           retryCount: { increment: 1 },
           nextAttemptAt: new Date(Date.now() + nextDelayMin * 60_000),
           failureReason: result.reason,
           attemptInProgress: false
         }
       });
     } else {
       await prisma.reward.update({
         where: { id: reward.id },
         data: {
           status: "Failed",
           retryCount: { increment: 1 },
           failureReason: result.reason,
           attemptInProgress: false
         }
       });
     }

4. return summary
```

### 6.3 Backoff timing

`nextAttemptAt = now + (2 ** retryCount) * 5 minutes` where `retryCount` is the value *before* this attempt incremented it. So the timeline for a reward that fails every time is:

- `t = 0` → attempt 1 (retryCount was 0); fails; `retryCount → 1`, `nextAttemptAt → t+5`.
- `t = 5 min` → attempt 2 (retryCount was 1); fails; `retryCount → 2`, `nextAttemptAt → t+10`.
- `t = 15 min` → attempt 3 (retryCount was 2); fails; `retryCount → 3`, `status = Failed`.

Total elapsed from initial Pending to Failed is ~15 minutes. After Failed, the row drops out of the worker's pickup query until a human Retries it (which resets `retryCount=0`, `nextAttemptAt=null`).

### 6.4 Idempotency layers

1. **Row-level claim** — the `updateMany ... WHERE attemptInProgress = false` step is atomic; if a stalled prior tick claimed the row, the current tick skips it. Stale claims expire if `updatedAt` is older than 30 minutes and `attemptInProgress = true` — handled by a defensive query in the worker before the main scan.
2. **Provider-level idempotency key** — each adapter passes `reward:${reward.id}:attempt:${reward.retryCount}` as the provider's idempotency key (or equivalent client-supplied transaction reference). A network hiccup mid-dispatch can't cause double issuance.
3. **Post-success guard** — the final `update where status NOT Issued` clause ensures even a race between two updates can't overwrite an already-Issued row.

### 6.5 Admin endpoints driven by the table

| Path | Behaviour |
|---|---|
| `POST /api/admin/rewards/:id/retry` | Validates row exists and status is `Pending` or `Failed`. Resets `retryCount=0`, `nextAttemptAt=null`, `status=Pending`, `failureReason=null`. Emits a `payouts.admin_action` structured log entry with `{ action: "retry", rewardId, actorId, actorRole }`. Next cron tick dispatches. Returns immediately; frontend shows "Queued for next dispatch (≤5 min)". |
| `POST /api/admin/rewards/:id/mark-issued` | Manual override. Required body `{ note: string (min 10 chars), providerTxnId?: string }`. Sets `status=Issued`, `issuedAt=now()`, `providerTxnId=body.providerTxnId ?? "manual"`, `noteFromActor=note`. Emits a `payouts.admin_action` structured log entry with `{ action: "mark_issued", rewardId, actorId, actorRole, note }`. |
| `POST /api/admin/rewards/manual` | Creates a new Reward row from the manual-issue drawer with `status=Pending`. Required body `{ userId, amount, channel?, note }`. Normal worker path picks it up. |
| `GET /api/admin/rewards` (extended) | Adds query params `status`, `from`, `to`, `q` (search), `cursor`, `limit`. Returns `meta.activeProvider: { key, sandbox } | null` so the page knows whether to show the configure-provider banner. |
| `GET /api/admin/rewards/export` | Same filters as the list endpoint; streams a CSV with columns: Learner, Phone, Module, Amount, Currency, Channel, Status, Created (UTC), Issued (UTC), Provider Txn ID, Failure Reason, Actor Note. |

### 6.6 Observability

Every dispatch attempt emits a structured log entry:

```json
{ "event": "payouts.dispatch", "rewardId": "...", "provider": "africas_talking",
  "sandbox": true, "status": "Issued|RetryQueued|Failed",
  "providerTxnId": "...", "retryCount": 0, "latencyMs": 312 }
```

Per-tick summary at `INFO`:

```json
{ "event": "payouts.tick.summary", "examined": 12, "dispatched": 8,
  "retried": 3, "movedToFailed": 1, "skipped": 0, "tickDurationMs": 2104 }
```

These ship via the existing logger to Cloud Logging — immediately queryable via `gcloud logging read` and shaped right for a future Grafana board.

### 6.7 Staging behaviour

Staging Cloud Scheduler is set up identically to production. The published Payouts doc on staging always has `sandbox: true`, so the worker runs end-to-end against the providers' sandbox URLs — no real airtime, no money burned, full UI exercise. The staging smoke (`backend/src/smoke/payouts-smoke.ts`, added in this work) asserts a synthetic module-completion webhook produces an `Issued` Reward within 6 minutes.

## 7. Data model changes

### 7.1 Prisma schema delta

```prisma
model Reward {
  id                String     @id @default(uuid())
  userId            String
  user              User       @relation(fields: [userId], references: [id])
  module            String
  amount            Float
  channel           String
  status            String     @default("Pending")  // Pending | Issued | Failed
  issuedAt          DateTime?
  // ---- new in this spec ----
  learnerPhone      String                                  // denormalised at write time
  providerTxnId     String?
  failureReason     String?
  retryCount        Int        @default(0)
  nextAttemptAt     DateTime?                               // null → eligible immediately
  attemptInProgress Boolean    @default(false)              // row-claim lock
  noteFromActor     String?                                 // set when admin overrides
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  // ---- new uniqueness ----
  @@unique([userId, module])    // one reward per (learner, module)
}
```

The new `@@unique([userId, module])` lets `recordAnalytics()` swap its current `findFirst + create` into a clean `prisma.reward.upsert` — same external behaviour, fewer round-trips, no race window between bot ticks.

### 7.2 `ensurePrismaTables` extension

Existing bootstrap pattern in `backend/src/admin/prisma.ts` is extended with:

- `ALTER TABLE rewards ADD COLUMN IF NOT EXISTS ...` for each new column.
- A `DO $$ ... pg_constraint ...` block to add the `@@unique([userId, module])` constraint idempotently.
- The "legacy table drop" pre-pass already handles the case where the original `rewards` table lacked an `id` column.

No migration files needed (project does not use `prisma migrate deploy` yet) — the boot bootstrap handles drift.

## 8. Code layout (new files)

### 8.1 Backend

```
backend/src/payouts/
├── providers/
│   ├── contracts.ts             # PayoutProvider, DispatchResult, ConnectionResult
│   ├── africas-talking.ts       # adapter (verifyCredentials, dispatch)
│   ├── termii.ts                # adapter
│   ├── reloadly.ts              # adapter
│   ├── africas-talking.test.ts  # unit tests (fetch stubbed)
│   ├── termii.test.ts
│   ├── reloadly.test.ts
│   └── index.ts                 # getActiveProvider() factory
├── worker.ts                    # dispatch loop, claim logic, backoff
├── worker.test.ts               # tick tests with seeded DB / mocked adapter
└── routes.ts                    # /internal/payouts/dispatch + admin endpoints
└── routes.test.ts               # supertest happy/auth/validation per endpoint

backend/src/smoke/
└── payouts-smoke.ts             # post-deploy end-to-end smoke for the gate
```

### 8.2 Frontend

```
dashboard/components/rewards/
├── RewardsHealthHero.tsx
├── IssuanceSuccessGauge.tsx
├── TotalPaidHeadline.tsx
├── NeedsAttentionPanel.tsx
├── RewardsToolbar.tsx
├── RewardsTable.tsx
├── RewardDetailDrawer.tsx
└── ManualRewardDrawer.tsx

dashboard/components/integration/payouts/
├── PayoutsProviderSelector.tsx
└── PayoutsCredentialFields.tsx

dashboard/app/previews/components/
├── RewardsWorkspacePreview.tsx          # all 8 reward components, all variants
└── PayoutsIntegrationPreview.tsx        # the new tab in its 3 provider modes
```

Every component lands in the `/previews` workshop with all variants (loading, empty, populated, error) before page composition. Existing project rule.

### 8.3 Shared design tokens

Extend `shared/src/design-tokens.ts` and `dashboard/app/globals.css`:

- `--color-success-100/700`, `--color-warning-100/700`, `--color-danger-100/700` for status pills (extends current 5-token badge system; no new semantics).
- `--shadow-drawer` for the right-side drawer.
- `--radius-hero` if not already an alias.

No raw hex in components or pages. Project rule.

## 9. Testing

| Layer | Tests added |
|---|---|
| Provider adapters | One `*.test.ts` per adapter. Stubs `fetch`. Asserts sandbox vs prod URL, request shape, success → `{ ok: true, providerTxnId }`, retryable vs non-retryable error mapping, idempotency-key inclusion. |
| Worker dispatch loop | `worker.test.ts` against `pg-mem` (or test DB if already wired). Seeds N Pending rows, mocks adapter to a mix of success/retryable/non-retryable. Asserts post-tick DB state. Includes a "two overlapping ticks" test proving row-claim prevents double dispatch. |
| Admin endpoints | `routes.test.ts` using supertest pattern from existing `webhook.test.ts`. Each of `/retry`, `/mark-issued`, `/manual`, `GET /rewards?filters`, `GET /rewards/export` gets happy-path + auth-failure + validation-failure tests. |
| Frontend components | React Testing Library snapshot + interaction tests for each of the eight new components. `RewardsTable.test.tsx` specifically covers hover-action visibility per status and keyboard accessibility. |
| Staging smoke | `payouts-smoke.ts` POSTs a synthetic module-completion webhook for a sandbox phone, waits ≤6 minutes, asserts the resulting Reward row reached `Issued`. Hooks into `staging-promotion-gate.yml` as a new step. |

## 10. Configuration & environment

### 10.1 New env vars (production + staging)

| Name | Where | Purpose |
|---|---|---|
| `PAYOUTS_WORKER_TOKEN` | Secret Manager → Cloud Run `--set-secrets` | Worker endpoint authentication |
| `PAYOUTS_CRON_DISPATCHER_URL` | Cloud Scheduler config | Target URL for the every-5-min job |

No new env vars for the provider credentials — those live in the published config doc. No new env vars for amount/currency — `REWARD_DEFAULT_AMOUNT` / `REWARD_DEFAULT_CHANNEL` stay as-is from the previous commit.

### 10.2 Cloud Scheduler job (production)

```
Name:    shetrades-payouts-dispatcher
Schedule: */5 * * * *
Time zone: Africa/Lagos
HTTP target: POST https://shetrades-backend-staging-.../internal/payouts/dispatch
Headers:  X-Internal-Worker-Token: ${PAYOUTS_WORKER_TOKEN}
Retry:    Cloud Scheduler max-retries 0 (the dispatcher is itself idempotent and self-retrying via DB state)
```

A second identical scheduler exists for staging, pointing at the staging URL.

## 11. Open items resolved with defaults (call out if you want different)

| Item | Default | Rationale |
|---|---|---|
| Default reward amount | Continue `REWARD_DEFAULT_AMOUNT=500` (NGN) env var | Per-module variable amounts are a follow-up |
| Admin notifications on Failed | Out of scope v1 | `Needs Attention` panel is v1 surface; can wire through Notification integration later |
| Export CSV columns | Learner / Phone / Module / Amount / Currency / Channel / Status / Created (UTC) / Issued (UTC) / Provider Txn ID / Failure Reason / Actor Note | Matches finance ops standard column set |
| Default date range on page load | Last 7 days | Avoids huge result sets while still showing recent work |
| Switching active provider while Failed rewards exist | Switching does NOT auto-retry the existing Failed rows | Avoids surprise mass-dispatch on provider rotation; admin uses Retry per row |
| Timestamp time zone | Stored UTC, rendered Africa/Lagos (UTC+1) | Matches where the team operates |

## 12. Implementation order (preview of the implementation plan)

The implementation plan will be authored by the `writing-plans` skill after this spec is approved, but at the design level the natural order is:

1. **Data model + bootstrap** — Prisma schema delta, `ensurePrismaTables` extension, deploy and verify columns landed.
2. **Provider adapter interface + first adapter** — `contracts.ts`, `africas-talking.ts` with stubs and unit tests, no UI wiring yet.
3. **Worker endpoint + dispatch loop** — `/internal/payouts/dispatch`, idempotent claim, backoff, structured logs. Tests against `pg-mem`. Deploy. Cloud Scheduler set up for staging.
4. **Remaining adapters** — `termii.ts`, `reloadly.ts` with tests.
5. **Admin endpoints** — `/retry`, `/mark-issued`, `/manual`, `/rewards` filters, `/rewards/export`. Tests.
6. **Payouts integration tab UI** — `PayoutsProviderSelector`, `PayoutsCredentialFields`, mount into `IntegrationSettingsWorkspace`, previews workshop entries.
7. **`/rewards` page redesign** — eight new components, previews workshop entries, replace `dashboard/app/(admin)/rewards/page.tsx`.
8. **Staging end-to-end** — publish sandbox provider config on staging, run smoke, observe live data.
9. **Production cut-over** — production credentials, production Cloud Scheduler, real-airtime canary on a single low-amount reward, then unblock the full backlog.

## 13. Acceptance criteria

A merged-and-deployed v1 of this work is "done" when:

- Visiting `/rewards` on staging shows: real success-rate gauge, real total-paid headline, no zero-stub copy; the table loads filtered, searchable, exportable rows from the live DB; row-hover actions work for Retry / Mark Issued / Open.
- Visiting `/settings → Integration → Payouts` on staging shows: provider selector, credential form, connection test, draft/publish flow. Switching providers updates the active indicator.
- A synthetic module-completion webhook produces a `Pending` reward; within 6 minutes, the staging Cloud Scheduler tick dispatches it via the sandbox provider; the row flips to `Issued` with a `providerTxnId` and a `payouts.dispatch` log entry.
- Manually clicking `Retry now` on a `Failed` row resets it to `Pending`, and the next tick dispatches it.
- Manually clicking `Mark Issued` with a note flips a `Pending` row to `Issued` with `noteFromActor` set.
- The Manual Reward drawer creates a `Pending` row that gets dispatched by the worker on the next tick.
- All new tests pass; CI typecheck and build pass.
- No `gcloud logging read` errors of severity `ERROR` from the backend during a 30-minute observation window post-deploy.

---

**End of spec.**
