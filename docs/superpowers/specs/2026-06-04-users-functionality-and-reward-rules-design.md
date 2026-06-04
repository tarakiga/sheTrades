# /users Page Functionality + Reward Rules Tab — Design Spec

- **Status:** Approved (user gave standing auto-approval while away). Pending implementation plan.
- **Date:** 2026-06-04
- **Owner:** AI Coding Agent
- **Related:** builds on the rewards/payouts work in `2026-06-04-rewards-redesign-design.md`.

## 1. Background and goals

Two admin-manageability gaps remain after the rewards/payouts work:

1. **`/users` is a read-only scaffold.** The learner directory table renders three row actions (Preview learner profile, Contact learner, Flag for follow-up) that are all hardcoded `disabled: true`, plus an "Export Users" header button and a "Create Import Batch" button that have no handlers. There is rich per-learner data in Postgres (`user_sessions`, `quiz_attempts`, `user_progress`, `rewards`) that nothing surfaces.

2. **Reward amount/channel is env-var-only.** Module-completion rewards take their amount and channel from `REWARD_DEFAULT_AMOUNT` / `REWARD_DEFAULT_CHANNEL` env vars on Cloud Run — not admin-manageable, violating the project's no-hardcoding rule.

### Goals

- Make the `/users` row actions functional: **Preview** (detail drawer) and **Flag for follow-up** (toggle + note), and wire **Export Users** (CSV).
- Add an admin-managed **Reward Rules** tab on `/settings` (after Integration) holding a global reward amount + channel + enabled flag, consumed by the WhatsApp handler at module completion with the env var as fallback.

### Non-goals (deferred to their own specs)

- **Contact learner** (WhatsApp send to a learner) — needs Meta Cloud API send + the 24-hour customer-care window. The row action stays visible but disabled with a "Soon" affordance.
- **Create Import Batch** (bulk CSV learner import) — file upload + per-row validation + dedupe + results report. Header button stays visible but disabled with a "Soon" affordance.
- **Per-module reward amounts** — the Reward Rule is global (one amount) for now.

## 2. Feature A — `/users` page functionality

### 2.1 Backend

Three new endpoints on `adminRouter` (mounted at `/api/admin`), following the existing plain-handler pattern used by the current `/users`, `/rewards`, `/rewards/:id/retry` endpoints. (Note: the existing admin endpoints do not apply per-route auth middleware; the new endpoints match that pattern for consistency. Whether `/api/admin` needs a global auth guard is a separate security review tracked as a follow-up, not addressed here.)

#### 2.1.1 `GET /api/admin/users/:phone` — learner detail aggregation

Aggregates one learner's full record from the Prisma-managed tables. Returns:

```ts
type LearnerDetail = {
  identity: {
    id: string;
    name: string | null;
    phone: string;
    location: string | null;
    language: string | null;
    status: string;            // "Active" | "At Risk" derived same as the directory
    flaggedForFollowUp: boolean;
    followUpNote: string | null;
    createdAt: string;         // ISO
  };
  session: {
    state: string | null;
    currentLessonKey: string | null;
    completedLessons: string[];
    lastUpdatedAt: string | null;  // ISO
  } | null;
  progress: Array<{ module: string; completionPercentage: number; updatedAt: string }>;
  quizAttempts: Array<{ lessonKey: string; passed: boolean; attemptCount: number; lastAttemptAt: string }>;
  rewards: Array<{ id: string; module: string; amount: number; channel: string; status: string; issuedAt: string | null; createdAt: string }>;
};
```

Implementation reads via Prisma: `prisma.user.findUnique({ where: { phone }, include: { session: true, progress: true, quizAttempts: true, rewards: true } })`. Returns 404 if the learner is not found. Timestamps normalised to ISO strings.

#### 2.1.2 `POST /api/admin/users/:phone/flag` — flag for follow-up

Body: `{ flagged: boolean, note?: string }` (Zod-validated; `note` max 500 chars). Sets two **new** `User` fields. Emits a `users.admin_action` structured log entry `{ action: "flag" | "unflag", phone, note?, actorId?, actorRole? }`. Returns the updated identity block. 404 if learner not found.

New Prisma `User` fields:

```prisma
flaggedForFollowUp Boolean  @default(false)
followUpNote       String?
```

Added via the drift-tolerant `ensurePrismaTables` pattern in `backend/src/admin/prisma.ts` (ALTER TABLE ... ADD COLUMN IF NOT EXISTS — no migration files). The `admin_users_view` (created in `initializeAdminViews`) is extended to expose `flaggedForFollowUp` so the directory list can show a flag indicator.

#### 2.1.3 `GET /api/admin/users/export` — CSV

Streams a CSV of the directory with columns: Name, Phone, Location, Language, Completion, Status, Flagged, Follow-up Note. Same escaping helper and `Content-Disposition: attachment` pattern as the existing `GET /api/admin/rewards/export`. Reads the same source as `getUsersData()`.

#### 2.1.4 Directory row shape

Extend `UserRow` (in `backend/src/admin/contracts.ts`) and the `admin_users_view` SELECT with `flaggedForFollowUp: boolean`. `fetchUsersFromPostgres` maps it. The fallback fixture (`fallbackUsersData`) gets `flaggedForFollowUp: false` on each row.

### 2.2 Frontend

#### 2.2.1 Convert `/users` to a client component

`dashboard/app/(admin)/users/page.tsx` becomes a client component (`"use client"`), matching the `/rewards` page pattern. It fetches via `getUsersPageData()` (already a client API helper) on mount, holds the directory in state, and manages drawer open / flagging / export. Initial-load skeleton via the existing loading conventions. The page keeps the existing `AdminReviewWorkspace` shell, metrics, and support cards — only the row actions and header buttons change.

#### 2.2.2 LearnerDetailDrawer

New component `dashboard/components/users/LearnerDetailDrawer.tsx`, reusing the right-side drawer shell + `--shadow-drawer` token established by `RewardDetailDrawer`. Props:

```ts
type LearnerDetailDrawerProps = {
  phone: string | null;       // null → closed
  open: boolean;
  onClose: () => void;
  onFlagChange: (phone: string, flagged: boolean, note?: string) => Promise<void>;
};
```

On open it fetches `GET /api/admin/users/:phone` (new client API `getLearnerDetail(phone)`). Sections: identity (name, phone, location, language, status, member-since), follow-up state (flag toggle + note field), session (state, current lesson, completed-lesson count, last active), progress-per-module list, quiz attempts list, and reward history list. Currency via the existing `formatNgn`, relative times via `formatRelativeTime`. Loading + error states. Registered in the `/previews` workshop (`UsersWorkspacePreview.tsx`) with loading / populated / empty / error variants.

#### 2.2.3 Row actions

The directory table's action column is rewritten to wire:

- **Preview** → `onOpenRow(phone)` opens `LearnerDetailDrawer`.
- **Flag for follow-up** → optimistic toggle calling `POST /api/admin/users/:phone/flag`; the row shows a flag indicator (a `Badge` or icon) when `flaggedForFollowUp` is true; reflected in the drawer too.
- **Contact learner** → stays in the action list but `disabled` with a "Soon" tooltip/aria-label.

Flagged rows render a small flag `Badge` (warning variant) next to the status so the state is visible without opening the drawer.

#### 2.2.4 Header buttons

- **Export Users** → `onClick` triggers a CSV download from `GET /api/admin/users/export` (via `window.location.href = usersExportUrl()`), matching the rewards export.
- **Create Import Batch** → kept visible but `disabled` with a "Soon" affordance (it currently lives in the "User Actions" support card's EmptyState; that secondary button becomes disabled + "Soon").

#### 2.2.5 Client API additions

In `dashboard/lib/admin/api.ts`:

```ts
export function getLearnerDetail(phone: string): Promise<ApiResult<LearnerDetail>>;
export function flagLearner(phone: string, body: { flagged: boolean; note?: string }): Promise<...>;
export function usersExportUrl(): string;
```

And `LearnerDetail` mirrored into `dashboard/lib/admin/contracts.ts`. `UserRow` (frontend mirror) gains `flaggedForFollowUp: boolean`.

## 3. Feature B — Reward Rules settings tab

### 3.1 Backend

#### 3.1.1 Config payload schema

New schema defined inline in `backend/src/config-platform/contracts.ts` (it is small — no separate module):

```ts
export const rewardRulesPayloadSchema = z.object({
  kind: z.literal("reward_rules"),
  amount: z.number().positive(),
  channel: z.literal("airtime"),
  enabled: z.boolean()
});
export type RewardRulesPayload = z.infer<typeof rewardRulesPayloadSchema>;
```

A `kind` discriminator literal is included so the payload is distinguishable inside `configPayloadSchema` and does not collide with the integration provider union. `rewardRulesPayloadSchema` is added as a member of `configPayloadSchema`'s union (before the generic `z.record` catch-all) so valid reward-rule payloads are first-class validated rather than falling through to the blob fallback.

The document lives at `namespace=integration`, `key=reward.rules.primary`, `type=integration_config` (reuses the existing integration document workflow: draft / publish / version history / rollback). `allowedTypesByNamespace` already permits `integration_config` under `integration`, so no change there.

#### 3.1.2 Runtime read helper

```ts
// backend/src/config-platform/runtime-config.ts
export function getRuntimeRewardRules(): RewardRulesPayload | null {
  return getRuntimeIntegrationConfig<RewardRulesPayload>("reward.rules.primary");
}
```

#### 3.1.3 Handler consumes it

In `backend/src/whatsapp/handler.ts`, the `recordAnalytics` `module_completed` branch (currently reads `process.env.REWARD_DEFAULT_AMOUNT` / `REWARD_DEFAULT_CHANNEL`) is updated to:

```ts
const rule = getRuntimeRewardRules();
if (rule && rule.enabled === false) {
  // Rewards disabled by admin — skip creating a reward row.
  return;  // (within this event branch)
}
const amount = rule?.amount ?? envDefaultAmount();   // envDefaultAmount keeps the 500 fallback
const channel = rule?.channel ?? envDefaultChannel();
```

So: a published rule overrides the env var; `enabled: false` suppresses reward creation entirely; no rule published → env-var fallback (unchanged behaviour). The existing `prisma.reward.upsert` is otherwise unchanged.

### 3.2 Frontend

#### 3.2.1 New settings tab

`dashboard/app/(admin)/settings/page.tsx`:
- Extend `SettingsTabId` union with `"rewards"`.
- Add a `TABS_BY_ID.rewards` entry (title "Rewards", hint "Reward amount and delivery") and append it to the `TABS` array **after** `integration`.
- Extend `resolveActiveTab` to accept `"rewards"`.
- When `activeTabId === "rewards"`, render the new `<RewardRulesWorkspace />`.

#### 3.2.2 RewardRulesWorkspace component

New `dashboard/components/integration/RewardRulesWorkspace.tsx` modelled on `IntegrationPayoutsWorkspace` (same config-admin request helper, draft/publish/rollback, version history). Form fields:
- **Reward amount** (number input, NGN, > 0).
- **Delivery channel** (select; only "airtime" for now).
- **Rewards enabled** (toggle).

It serializes to the `rewardRulesPayloadSchema` shape (`kind: "reward_rules"` injected), validates client-side, and uses the existing `/api/config/admin/integration/documents` create + `/draft` update + `/publish` endpoints with `key=reward.rules.primary`. An "Active rule" indicator shows the published amount/channel/enabled. Registered in the `/previews` workshop.

## 4. Data model summary

| Table / doc | Change |
|---|---|
| `users` (Prisma) | + `flaggedForFollowUp Boolean @default(false)`, + `followUpNote String?` |
| `admin_users_view` | + `flaggedForFollowUp` column in the CREATE OR REPLACE VIEW |
| config doc `reward.rules.primary` | new integration-namespace document holding `{ kind, amount, channel, enabled }` |
| `UserRow` (backend + frontend contracts) | + `flaggedForFollowUp: boolean` |

`ensurePrismaTables` gains ALTER TABLE ADD COLUMN IF NOT EXISTS for the two new user columns. No migration files (consistent with the rest of the project).

## 5. Code layout

### New backend files
```
backend/src/admin/users-detail.ts          # learner-detail aggregation query (keep route handlers thin)
backend/src/admin/users-detail.test.ts
```
(The reward-rules schema is defined inline in `contracts.ts` — small enough not to warrant its own module. Aggregation logic is extracted into `users-detail.ts` so the route handler stays thin and the query is unit-testable.)

### Modified backend files
```
backend/prisma/schema.prisma                # +2 User fields
backend/src/admin/prisma.ts                 # ALTERs + admin_users_view +flaggedForFollowUp column
backend/src/admin/contracts.ts              # UserRow +flaggedForFollowUp; LearnerDetail type
backend/src/admin/providers/postgres.ts     # fetchUsersFromPostgres maps flaggedForFollowUp
backend/src/admin/fixtures.ts               # fallbackUsersData rows +flaggedForFollowUp:false
backend/src/routes/admin.ts                 # +GET /users/:phone, POST /users/:phone/flag, GET /users/export
backend/src/routes/admin.test.ts            # tests for the three endpoints
backend/src/config-platform/contracts.ts    # +rewardRulesPayloadSchema in configPayloadSchema union
backend/src/config-platform/runtime-config.ts # +getRuntimeRewardRules
backend/src/whatsapp/handler.ts             # module_completed reads getRuntimeRewardRules
```

### New frontend files
```
dashboard/components/users/LearnerDetailDrawer.tsx
dashboard/components/users/LearnerDetailDrawer.test.tsx
dashboard/components/integration/RewardRulesWorkspace.tsx
dashboard/app/previews/components/UsersWorkspacePreview.tsx
```

### Modified frontend files
```
dashboard/app/(admin)/users/page.tsx        # → client component, wired actions
dashboard/app/(admin)/settings/page.tsx     # + Rewards tab
dashboard/lib/admin/api.ts                  # getLearnerDetail, flagLearner, usersExportUrl
dashboard/lib/admin/contracts.ts            # LearnerDetail; UserRow +flaggedForFollowUp
dashboard/app/previews/page.tsx             # register UsersWorkspacePreview
```

## 6. Testing

| Layer | Tests |
|---|---|
| Learner-detail aggregation | `users-detail.test.ts`: given seeded user+session+progress+quiz+rewards, returns the correct aggregated shape; 404 path. (Requires a test DB; if unavailable in the local env, the test is written to run in CI where Postgres is present, matching the existing worker/admin test situation.) |
| Flag endpoint | `admin.test.ts`: flag sets fields + returns identity; unflag; note length validation (400); 404 for unknown phone. |
| Users export | `admin.test.ts`: CSV header row matches the 8 columns; attachment disposition. |
| Reward rules schema | a schema unit test (no DB): valid rule parses; `configPayloadSchema` accepts a reward-rule payload and routes it to the reward-rules member, not the catch-all. |
| Handler rule consumption | extend the handler/analytics path test: published rule overrides env amount; `enabled:false` suppresses reward creation; no rule → env fallback. |
| Frontend | RTL tests for `LearnerDetailDrawer` (loads detail, flag toggle calls handler, ESC closes) and the `/users` row-action wiring (Preview opens drawer, Flag optimistic, Contact disabled). Reward rules form: validation + serialize shape. |

## 7. Acceptance criteria

- On `/users`, clicking **Preview** on a learner opens a drawer showing their real identity, session state, per-module progress, quiz attempts, and reward history.
- Clicking **Flag for follow-up** toggles a persisted flag; the row shows a flag indicator and the state survives reload.
- **Export Users** downloads a CSV with the 8 specified columns reflecting current directory data.
- **Contact learner** and **Create Import Batch** are visibly present but disabled with a "Soon" affordance (no dead/unresponsive buttons).
- `/settings → Rewards` lets an admin set the reward amount, channel, and enabled flag, with draft/publish; a published rule changes the amount of newly-created module-completion rewards without a redeploy; `enabled:false` stops new rewards; no rule falls back to the ₦500 env default.
- All new tests pass; backend typecheck and dashboard build pass.

## 8. Follow-ups (logged, not in scope)

- Decide whether `/api/admin/*` needs a global auth guard (the existing admin endpoints, including the rewards admin actions, are unauthenticated plain handlers).
- Contact learner (WhatsApp send) — own spec.
- Create Import Batch (bulk CSV import) — own spec.
- Per-module reward amounts.
- A learner-list picker endpoint to replace the `ManualRewardDrawer` autocomplete stopgap (carried over from the rewards spec).
