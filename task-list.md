# SheTrades - Content Admin Wizard Refactoring Tracker

This checklist tracks the design and implementation of the premium step-wizard editor form inside the Admin settings panel to completely replace raw JSON configurations for non-technical admins.

## Task 071 — Language-aware schema + WhatsApp constraint counters (2026-07-14)

Prereq for translating lessons to Pidgin/Igbo. Two deliverables:

- [x] **Schema language-awareness** — make lesson `title` and `quiz` (question + options) per-language (`LocalizedValue = string | {en,pcm?,ig?}`), backward compatible with legacy string values.
  - [x] Backend: `LocalizedValue` type + `pickLocalized()` resolver in runtime-config.ts
  - [x] Backend: `getRuntimeLessons()` preserves localized title/quiz (no more `String()` flattening)
  - [x] Backend: handler.ts resolves title/question/options by active language everywhere
  - [x] Frontend drawer: per-language title + per-language quiz question/options (parse+serialize both shapes)
- [x] **Constraint counters** — live green/yellow/red character meters that account for bot-added chars.
  - [x] Shared SoT: `backend/src/whatsapp/constraints.ts` (limits) + `dashboard/lib/whatsapp-constraints.ts` (limits + compose helpers)
  - [x] Reusable `ConstraintMeter` component (tokens: success/warning/danger) + preview story
  - [x] Wire into drawer: title (72), body (1024 composed), quiz question (1024 composed), quiz options (20 each), per active language tab
  - [x] Verify visually in browser + screenshot (all states render; backend typecheck+14 tests green; dashboard typecheck green; net −1 lint)
  - Follow-ups (not blocking): drive the authenticated drawer end-to-end (needs admin login); optional tighten of server-side lesson Zod validation (lessons currently persist via the `z.record` catch-all, unchanged by this task).

## Core Refactoring Checklist

- [x] Define dynamic style classes at the end of `globals.css`
  - [x] Glassmorphic toggle between Visual Wizard and Raw JSON Mode
  - [x] Step-by-step navigation progress indicators (Step 1-4)
  - [x] Phone layout (`.phone-mock`) with WhatsApp wallpapers and bubbles
  - [x] Emoji picker and insertion buttons
- [x] Implement Premium Step Form in `ConfigEditorDrawer.tsx`
  - [x] Detect if namespace is `"content"`, fallback to standard form for other namespaces
  - [x] Auto-parse stringified JSON payload into responsive React states (Curriculum or Translates)
  - [x] Step 1: Module & Lesson Metadata panel (Dynamic Module selector, Title, expandable Audio URLs)
  - [x] Step 2: Content Body & Emojis Panel (Textareas for EN, PCM, IG + cursor emoji inserter)
  - [x] Step 3: Quiz Builder Panel (Question builder, options array, radio answer Index selector)
  - [x] Step 4: Visual WhatsApp Smartphone Simulator (Parses formatting and renders buttons)
  - [x] State synchronization (Auto-serializes form fields to standard JSON string on change)
- [x] Build and Verify Changes
  - [x] Run `npm run build` locally in the dashboard to ensure perfect Turbopack and production compiling
  - [x] Conduct manual verification of step progression, quiz adding, and JSON serialization
  - [x] Prevent browser biometric & credential autofill extension interference (which caused scroll locking and CSP violations) by adding ignore and autocomplete/autocorrect settings to form inputs and name slug inputs.
- [x] Fix WhatsApp Handler bugs (quiz next button logic, 500 error on new user, fallback text duplication, strict 3-option limit)

## Rewards Page Redesign + Automated Payouts (2026-06-04)

Plan: `docs/superpowers/plans/2026-06-04-rewards-redesign.md`

- [x] Task 1: Reward schema delta + `ensurePrismaTables` ALTERs + bot upsert swap
- [x] Task 2: Payouts provider contracts (Zod discriminated union)
- [x] Task 3: Africa's Talking adapter + 13 tests
- [x] Task 4: Provider factory `getActiveProvider()` + test seam
- [x] Task 5: Worker dispatch loop (claim, exponential backoff 5/10/20 min, structured logs)
- [x] Task 6: Worker HTTP endpoint + `PAYOUTS_WORKER_TOKEN` auth
- [x] Task 7: Termii adapter
- [x] Task 8: Reloadly adapter
- [x] Task 9: Extended `GET /admin/rewards` with filters + `meta.activeProvider`
- [x] Task 10: Admin endpoints — `/retry`, `/mark-issued`, `/manual`
- [x] Task 11: CSV export endpoint
- [x] Task 12: Design tokens + currency / relative-time helpers
- [x] Task 13: `RewardsHealthHero` + 3 sub-components + preview
- [x] Task 14: `RewardsToolbar`
- [x] Task 15: `RewardsTable` + `RewardDetailDrawer`
- [x] Task 16: `ManualRewardDrawer`
- [x] Task 17: Wired `/rewards` page composition
- [x] Task 18: `PayoutsProviderSelector` + `PayoutsCredentialFields` + preview
- [x] Task 19: Registered Payouts tab in `IntegrationSettingsWorkspace`
- [x] Task 20: Staging payouts smoke script + CI wire-up + handoff entry. Cloud Scheduler / Secret Manager creation deferred to operator (commands documented in `handoff.md`).

## 2026-06-04: Cloud Scheduler worker + /users functionality + Reward Rules tab
- `[x]` Set up the staging payouts Cloud Scheduler worker (API enable, secret, token mount, every-5-min job; verified a scheduler-triggered tick reaches the worker).
- `[x]` /users page functional: learner-detail drawer (Preview), flag-for-follow-up (toggle + note + flagged badge), CSV export; Contact + Create Import Batch shown disabled with "coming soon". Backend: GET /api/admin/users/:phone, POST /users/:phone/flag, GET /users/export; new User.flaggedForFollowUp + followUpNote columns.
- `[x]` Reward Rules tab on /settings (after Integration): admin-managed reward amount/channel/enabled via config-platform doc reward.rules.primary; WhatsApp handler honors it with the env var as fallback.

## 2026-06-04: Audit gap-clearing (DONE)
- `[x]` Critical: gate all `/api/admin/*` behind `authenticateJwt` + attach Bearer token on the frontend; converted /dashboard, /analytics, /reports to client components (revs 00058–00060).
- `[x]` Manual reward picker fixed: `/rewards/manual` resolves by phone; picker lists all learners from `/api/admin/users`.
- `[x]` Payouts "Test Connection" (`POST /api/integrations/admin/payouts/test` + button).
- `[x]` Donor-export reports token fails closed (no hardcoded fallback).
- `[x]` UI honesty pass: login Enter-to-submit, open-learner nav, "Configure Milestone Rule" → /settings, disabled "(coming soon)" buttons, Realtime-Sync stub copy.

---

## Remaining Gaps Backlog — full detail + file:line in `docs/remaining-gaps.md` (2026-06-04)

### A. Security & access control (HIGH first)
- `[x]` GAP-A1 (HIGH): Gate `POST /webhook/whatsapp/reset` (currently public; wipes all UserSession rows). `backend/src/routes/webhook.ts:38`
- `[x]` GAP-A2 (HIGH): Gate `GET /webhook/whatsapp/session/:phone` (currently public; leaks learner PII). `webhook.ts:47`
- `[x]` GAP-A3 (HIGH): Add `requireRoles(["editor","admin"])` to adminRouter mutations (flag / retry / mark-issued / manual). Currently any valid JWT (incl. viewer) can mutate. `admin.ts:25`
- `[x]` GAP-A4 (HIGH): Fix audit-log actor — read `req.authUser` not `(req as any).adminUser` (actorId always null today); add `updatedAt`/version to log lines. `admin.ts:267,305,346`
- `[x]` GAP-A5 (HIGH): Replace real secrets in `.env.example` with placeholders (live JWT secret + `ADMIN_AUTH_BOOTSTRAP_PASSWORD`); rotate the staging bootstrap password.
- `[x]` GAP-A6 (MED): Gate or remove legacy in-memory routers mounted at `/api`: `content.ts` (lesson CRUD/publish), `learning.ts` (GET /users/:phone, POST /progress), `rewards.ts`.
- `[x]` GAP-A7 (MED): `reliability-check.ts:57` re-introduces the hardcoded `local-dev-reports-token` — use env only.
- `[x]` GAP-A8 (MED): Enforce inbound Meta webhook signature (`X-Hub-Signature-256` + appSecret).

### B. "No hardcoded values" mandate (CLAUDE.md)
- `[x]` GAP-B1 (HIGH): Move all bot conversation copy + menu/language button labels to config (`getPrompt()` table + hardcoded arrays in `handler.ts:~335-637`) via `getRuntimeText()`/`getRuntimeOptionSet()` + seeds.
- `[x]` GAP-B2 (MED): Analytics live SQL hardcodes `'Anambra'`/`'Delta'` — drive from `FS_LOCATION_VALUE_*`. `admin/providers/postgres.ts:164`
- `[x]` GAP-B3 (MED): Frontend hardcoded option sets/copy → config: analytics/dashboard tabs, reports presets, RewardRules channel options, RewardsToolbar pills/date-ranges, manual reward defaults, AdminShell nav.
- `[x]` GAP-B4 (MED): Hardcoded thresholds → env/config: worker batch/retry/delay; legacy engine pass-%/lessons-per-module/reward amount.

### C. Bot conversation-flow correctness
- `[x]` GAP-C1 (HIGH): Fix stuck state when `awaitingQuizAnswer` but quiz item is undefined (reset + re-prompt). `handler.ts:703`
- `[x]` GAP-C2 (HIGH): Mark message processed only AFTER `saveSession` succeeds (avoid dropping Meta retries on DB failure). `handler.ts:~1067`
- `[x]` GAP-C3 (MED): DB/Redis-backed `processedMessageIds` (cross-replica + bounded).
- `[x]` GAP-C4 (MED): Module selection name-matching (not numeric-only); resolve `list_reply` by `id` not `title`.
- `[x]` GAP-C5 (MED): Localize invalid-state re-prompt + progress summary; drop `lessons.length || 6` magic total.
- `[x]` GAP-C6 (MED): Report exports query real data (not `buildMockRows`). `reports/export-service.ts`
- `[x]` GAP-C7 (LOW): Emit `lesson_viewed` analytics event; paginate module buttons when >3 (sender truncation).

### D. Resilience / scaling / validation
- `[ ]` GAP-D1 (MED): Persist in-memory singletons (admin sessions, translation requests, export jobs) to Postgres. (Admin sessions covered by the Admin-Users module below.)
- `[ ]` GAP-D2 (MED): Validate admin reward filters (from/to/limit/q/cursor) with Zod coercion + caps. `admin.ts:33-40`

### E. Config API contract & caching (mandate)
- `[ ]` GAP-E1 (MED): Frontend config contracts → Zod, validated on the client. `dashboard/lib/config/contracts.ts`
- `[ ]` GAP-E2 (MED): Replace blanket `cache:"no-store"` with ETag/version-tag revalidation (SWR/React Query or `next.revalidate`). `dashboard/lib/config/api.ts:7`

### F. CI / tests / migrations
- `[x]` GAP-F1 (HIGH): Run the test suite in CI (`npm run test -w @shetrades/backend`, with a Postgres service) + `next build` for the dashboard. `.github/workflows/ci.yml`
- `[ ]` GAP-F2 (MED): Adopt Prisma migrations (replace hand-coded `ensurePrismaTables`).
- `[ ]` GAP-F3 (MED): Add `POSTGRES_URL` to `.env.example`.

### G. Required documentation deliverable
- `[x]` GAP-G1 (HIGH): Write `docs/admin-how-to-guide.md` — add/edit/publish content, manage permissions, rollbacks, caching troubleshooting.

### H. UI quality / a11y / design tokens
- `[ ]` GAP-H1 (MED): Page data loads catch fetch errors → error state (no infinite spinner). users/reports/analytics pages.
- `[ ]` GAP-H2 (MED): Tokenize raw inline styles/hex in ConfigAdminManager, ConfigEditorDrawer, GuidedInternalNameBuilder, RichTextEditor.
- `[ ]` GAP-H3 (MED): a11y — Tabs descriptive labels, toggle `aria-pressed`, language-toggle tab roles, icon-button `aria-label`.
- `[ ]` GAP-H4 (LOW): Add preview entries for AdminWorkspaceMetricStrip, RichTextEditor, Textarea, AdminRouteLoading.

---

## Admin User Management Module (NEW) — "Admins" tab on `/settings` after Rewards

Goal: a role-gated module to add platform admins, assign roles, and suspend/reactivate them.
Confirmed constraints from the codebase:
- Admin users + sessions are currently **in-memory** (`AdminAuthService` `Map`) — they do NOT survive restarts or span Cloud Run replicas. **Persistence is the prerequisite, not optional.**
- Roles already exist and gate the API: `admin` | `editor` | `viewer`. Status field exists: `active` | `disabled` (extend → `suspended`).
- Design defaults (adjust if desired): only role `admin` can manage admins; new admins are created with a temporary password (admin communicates it; user changes it via existing ProfilePasswordForm); guardrails prevent suspending/demoting yourself or the last active admin; every mutation is audit-logged (updated_by/updated_at).

### Phase A — Persistence foundation (also clears GAP-D1 for sessions)
- `[x]` AUM-A1: Add `admin_users` + `admin_sessions` tables (Prisma model + `ensurePrismaTables` ALTERs, or a migration if GAP-F2 lands first). Columns: id, email (unique), fullName, role, status, passwordHash, avatarUrl, createdAt, updatedAt, lastLoginAt, createdBy.
- `[x]` AUM-A2: Swap `AdminAuthService` from `Map` to a Prisma-backed repository; keep bootstrap-from-env when the table is empty; sessions persisted + validated against DB (so a session minted on one instance works on another, and suspending a user invalidates sessions).
- `[x]` AUM-A3: Tests for repository (create/find/update/suspend, bootstrap-once, session lookup).

### Phase B — Backend admin-management API (gated `authenticateJwt` + `requireRoles(["admin"])`)
- `[x]` AUM-B1: `GET /api/admin/admins` — list (id, name, email, role, status, lastLoginAt).
- `[x]` AUM-B2: `POST /api/admin/admins` — create {email, fullName, role, tempPassword}; Zod validation (email format, role enum, password policy, duplicate email).
- `[x]` AUM-B3: `PATCH /api/admin/admins/:id/role` — change role (guard: not last admin / not self-demote).
- `[x]` AUM-B4: `POST /api/admin/admins/:id/suspend` + `/reactivate` — toggle status (guard: not self, not last active admin); invalidate suspended user's sessions.
- `[x]` AUM-B5: `POST /api/admin/admins/:id/reset-password` (optional) — set a new temp password.
- `[x]` AUM-B6: Audit-log every mutation (actor from `req.authUser`, action, target, timestamp). Route + service tests incl. auth/role/guardrail cases.

### Phase C — Frontend "Admins" workspace + tab
- `[x]` AUM-C1: Client API helpers in the admin-config client (list/create/role/suspend/reactivate) with Bearer token.
- `[x]` AUM-C2: `AdminUsersWorkspace` component (shared UI library: Table, Badge for role/status, Button, ConfirmationModal, drawer/form for create + role change). Built to enterprise/a11y standard.
- `[x]` AUM-C3: Register as the "Admins" tab in `IntegrationSettingsWorkspace` (after the Rewards tab) at `/settings`.
- `[x]` AUM-C4: Add a preview/story entry for `AdminUsersWorkspace`.

### Phase D — Verify, document, deploy
- `[x]` AUM-D1: Typecheck + build (backend + dashboard); run new tests; manual e2e on staging (create → login as new admin → suspend → login blocked → reactivate).
- `[x]` AUM-D2: Document in `docs/admin-how-to-guide.md` (ties into GAP-G1): managing admins, roles, suspension, password resets.
- `[x]` AUM-D3: Deploy backend (Cloud Run) + push (Vercel); update handoff.md.
