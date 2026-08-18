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
- `[x]` GAP-D1 (MED): Persist in-memory singletons to Postgres — admin sessions + translation requests DONE (admin_sessions / translation_requests tables). Export jobs remain in-memory (regenerable artifacts, low severity); config-platform cache is a cache by design.
- `[x]` GAP-D2 (MED): Validate admin reward filters (from/to/limit/q/cursor) with Zod coercion + caps. `admin.ts:33-40`

### E. Config API contract & caching (mandate)
- `[x]` GAP-E1 (MED): Frontend config contracts → Zod, validated on the client. `dashboard/lib/config/contracts.ts`
- `[x]` GAP-E2 (MED): Replace blanket `cache:"no-store"` with ETag/version-tag revalidation (SWR/React Query or `next.revalidate`). `dashboard/lib/config/api.ts:7`

### F. CI / tests / migrations
- `[x]` GAP-F1 (HIGH): Run the test suite in CI (`npm run test -w @shetrades/backend`, with a Postgres service) + `next build` for the dashboard. `.github/workflows/ci.yml`
- `[x]` GAP-F2 (MED): Prisma migrations ADOPTED - baseline generated (3c26e5a) and STAMPED on staging via Cloud SQL proxy (migrate status: "Database schema is up to date"). Future schema changes: `prisma migrate dev` locally, `npm run db:migrate:deploy` on release. Remaining follow-up: wire migrate deploy into startup/CI, then retire ensurePrismaTables.
- `[x]` GAP-F3 (MED): Add `POSTGRES_URL` to `.env.example`.

### G. Required documentation deliverable
- `[x]` GAP-G1 (HIGH): Write `docs/admin-how-to-guide.md` — add/edit/publish content, manage permissions, rollbacks, caching troubleshooting.

### H. UI quality / a11y / design tokens
- `[x]` GAP-H1 (MED): Page data loads catch fetch errors → error state (no infinite spinner). users/reports/analytics pages.
- `[x]` GAP-H2 (MED): Tokenized (hex earlier; px in 3c26e5a). Hairline borders + structural min/max heights intentionally literal.
- `[x]` GAP-H3 (MED): a11y — Tabs descriptive labels, toggle `aria-pressed`, language-toggle tab roles, icon-button `aria-label`.
- `[x]` GAP-H4 (LOW): Add preview entries for AdminWorkspaceMetricStrip, RichTextEditor, Textarea, AdminRouteLoading.

### UX Review Round 3 (7 July 2026) — verified against code 2026-07-21

Every substantive finding reproduced in code. Flow 7's observation text is stale Round 2
copy (it describes the duplicate `1. Module 1` label that Flow 4 confirms fixed) — ask the
reviewer to correct it before the report circulates.

- `[x]` **R3-F10 (HIGH): My Progress reported a hardcoded 0% + "Module 1".** Root cause was
  the published `bot.progress.summary` config value, not the handler — the template baked
  the percentage in as a literal and omitted `{percentage}`, so the substitution was a
  no-op for every learner, permanently. Fixed in the seed + regression test (`e8be7fd`).
  **Still needs the live config republished — see handoff.md.**
- `[x]` **R3-F10b (DONE 01b8735: per-module + overall, operator product call; {moduleBreakdown} token supported): progress percentage is scoped to all 43 lessons, not the active
  module.** A learner who finishes a full lesson sees "1 out of 43 — 2%". Accurate but
  demoralising. Product call: per-module percentage, or per-module + overall.
- `[x]` **R3-F2 (DONE 01b8735: reset clears stored language): `Selected Language` shows EN before the learner taps one.** Not a
  panel bug — the panel renders `n/a` correctly. "Reset Session State" deletes the session
  row but not the user row, and `handler.ts:394/415` rehydrate `language` from the user
  record. Fix: clear the stored language on reset, or skip rehydration during onboarding.
- `[x]` **R3-F6 (DROPPED by operator design call: the in-body option list is the deliberate full-text fallback for clipped 20-char buttons): quiz options rendered twice** — numbered list in the message body
  (`handler.ts:915`) *and* as buttons (`handler.ts:922`). Drop the in-text list when
  buttons are present; keep it for non-button/feature-phone delivery.
- `[x]` **R3-F5 CONTENT BREACH RESOLVED (verified live 2026-07-23):** operator shortened the lessons - all 43 composed messages now fit the 1024-char interactive cap (longest 950; was 27 over, max 1392). Quiz options: 35/387 marginally over the 20-char button cap (21-29 chars, cosmetic clipping only - delivery unaffected, clip-tolerant matching handles echoes). TRANSLATION GATE CLEARED. Residual (optional): dense-bubble pacing is now a UX preference, not a breach.
- `[x]` **R3-F5/6/9 (DONE 01b8735: derived displayState in session endpoint + sandbox panel): Dialogue State stuck at `module_menu` during lessons/quizzes.**
  `ConversationState` (`handler.ts:18`) has 7 values, none for lesson or quiz activity.
  The data already exists on the session (`awaitingQuizAnswer`, `currentQuizIndex`) — this
  is a diagnostics-panel display fix, not a state-machine rewrite.
- `[x]` **R3-F8 (DONE 01b8735: quizRetryCount column via first real migration; hint on 2nd miss, verified live): incorrect-answer retry repeats the question verbatim**
  (`handler.ts:1011-1022` rebuilds identical text, options and buttons). Vary the copy and
  add a hint on the second attempt.
- `[x]` **R3-misc (DONE: bot.module.started archived on staging): `bot.module.started` is orphaned config** — seeded, hardcodes
  "Module 1", read by no code. Either wire it up or remove it so editors aren't editing a
  string that does nothing.

- `[x]` **R3-tests (MED - DONE 3c26e5a: guards applied, socket-leak root-caused, suite 402/0/42 in ~14s)** was: (MED): `webhook.test.ts` has 5 failing tests with no DB guard.** Verified
  pre-existing (identical 5 pass / 5 fail on `9c2b421`, before the Flow 10 fix). The 5 that
  pass are the ones that never touch Postgres (challenge verify, 401 auth checks); the 5
  that fail all POST a real message payload, which the handler cannot process without a DB.
  Same class as the translation-request tests — needs a `skipWithoutDb` guard so a local run
  reports skipped rather than failed, and CI (which has Postgres) keeps real coverage.
  Confirm the guard hypothesis before applying it: do not mask a genuine delivery break.

## Reflection questions & help signals (2026-07-21) — DONE

Plan: `docs/superpowers/plans/2026-07-21-reflection-questions.md`. Branch `fix/reflection-questions`.

Tester report: Module 2 Lesson 6 marked "I need help migrating" as ❌ and looped the same
question. Investigation found it larger — **"Not yet" was also marked wrong**, there is no
retry limit, and since module completion drives a real airtime payout the bot was
effectively paying learners to misreport, corrupting the completion figures reported to funders.

- `[x]` Extract clip-tolerant `resolveQuizOptionIndex`; `isQuizReplyCorrect` delegates.
  Review caught that the `-1` "no match" sentinel collided with `answerIndex === -1`, making
  every unrecognised reply score CORRECT — restored the `>= 0` guard. Also fixed an inherited
  bug where an exact full-text match lost to an earlier option's 20-char clipped prefix.
- `[x]` `kind: "scored" | "reflection"` + `helpOptionIndex` on the quiz item. Absent `kind`
  normalises to `"scored"`, verified byte-identical against the old mapper over 11 legacy shapes.
- `[x]` `quiz_help_ack` / `reflection_next` / `reflection_module_complete` copy in en/pcm/ig.
- `[x]` Handler branches on kind. Reflection answers always advance; the advance path is
  extracted and shared with the scored path (verified 119 lines byte-identical) so the two
  cannot drift. `quiz_answered` correctly suppressed for reflection questions.
- `[x]` Review caught that the shared helper still said "🎉 Correct!" to someone answering
  "Not yet" — fixed with caller-chosen copy rather than a second code path.
- `[x]` `help_requested` raises the existing `flaggedForFollowUp`/`followUpNote` on User
  (previously unwired to the bot); notes append so repeat requests are retained.
- `[x]` Admin quiz builder: question-type toggle + help-option picker; scored questions
  serialize byte-identically so no version-history noise. WhatsApp simulator in the drawer
  also corrected — it was hardcoded to scored semantics and contradicted the feature.
- `[x]` Preview entry for the quiz builder (it rendered nowhere in `/previews/components`).
- `[x]` **Content backfill DONE (verified live 2026-07-23: 37/129 quiz questions marked reflection, incl. every real check-in - a heuristic sweep found zero unmarked)**  was: — `docs/reflection-question-candidates.md` lists 11
  candidate questions for a human verdict. Nothing changes until an editor marks a question
  in the admin UI; every question is treated as scored by default, so leaving it undone is safe.

## Lesson payload validation (2026-07-21) — DONE

- `[x]` **Validate quiz indices on the `lesson_content` publish path.** Root cause behind the
  `-1` sentinel finding: `config-platform/service.ts` returned the payload as-is and
  `postgres-service.ts` (the live path) fell through to `default`, so lesson content was
  published entirely unvalidated. The zod guard with `.min(0)` lives in `content/service.ts`,
  a different write path that config-platform bypasses.
  Added `lessonDocumentPayloadSchema`, wired into both paths.
  **Governing rule:** the schema must never reject a payload the bot already renders — it
  gates `updateDraft`, not just publish, so a false positive blocks an editor from SAVING.
  Only learner-trapping data is rejected (an index pointing at a nonexistent option, where no
  reply can match and the retry loop has no limit).
  `lesson-schema-conformance.test.ts` asserts that subset property over 27 runtime-tolerated
  shapes; the previous "every seeded lesson validates" test could not have caught the
  false positives, since all six seeds are shape-identical.
  Read-time warning added (deduped — `getRuntimeLessons()` re-normalises on every inbound
  message) so content already in the database that violates the bounds is visible in logs.
  Deliberately not clamped: picking a correct answer would fabricate an assessment result.

## Machine Translation Workflow (2026-07-22) — DONE

Plan: `docs/superpowers/plans/2026-07-22-machine-translation-workflow.md`. Branch
`feat/translation-provider-adapter`. Executed subagent-driven, two-stage review on the
correctness-critical pieces.

Bulk/single machine translation of the 43 lessons into Pidgin and Igbo, into a review draft
area with the WhatsApp character gauges, promoted per-language into live content.

- `[x]` Provider-agnostic adapters: Igbo API (eng↔ibo, one-string-per-request, daily cap) and
  an LLM (Gemini complete; Anthropic a documented stub — load the claude-api skill to finish).
  Provider chosen PER LANGUAGE (Igbo API can't produce Pidgin; only an LLM can honour the
  20-char option budget).
- `[x]` `translation_drafts` store + repository with forward-only review status
  (machine_draft→in_review→approved→promoted); a re-run never overwrites reviewed work.
- `[x]` Position-keyed extraction + reassembly BY ID — a provider that reorders/drops options
  can't misalign answerIndex; a failed option stays English (reviewed adversarially).
- `[x]` Quota-aware resumable runner — proven (translateCalls===0) that reviewed/up-to-date
  work never hits the paid API; stops at the cap and resumes next run.
- `[x]` Conflict-aware per-language promotion — changes only the target language, never
  answerIndex, refuses if the lesson has a pending English edit, atomic via
  expectedDraftVersionId (reviewed adversarially; branches executed).
- `[x]` Admin routes (run/review/approve/promote + test connection), gated, business-rule
  errors mapped to 409 not 500.
- `[x]` Translations tab after Payouts: provider settings + Test Connection, and the review
  workspace with the gauges (browser-verified: RED over-limit meters on title 39/24 and
  option 28/20, full approve→promote state machine).
- `[x]` Staleness: promote refuses if the English changed since translation; review list shows
  an "English changed" badge.

**Verification:** 72 translation tests pass / 3 skipped (DB-guarded); both packages typecheck
clean; UI browser-verified via `/previews/components`.

**Still open / for the operator:**
- Set the Igbo API `dailyRequestLimit` to the key's REAL cap (docs say 2,500/day; operator
  reported 500) before the first bulk run.
- **Shorten the 27 over-1024-char English lessons before bulk-translating** — translations
  inherit and worsen the overflow, or reviewers fix over-length copy twice.
- Anthropic adapter is a stub (Gemini covers both languages with the operator's key).
- The end-to-end run against real content + a real Gemini/Igbo key has NOT been exercised —
  the paths are unit-tested but not run live.

### DEFERRED — circle back after translations (paused 2026-07-21)

Both are intentionally parked, not forgotten. Neither blocks the Pidgin/Igbo work.

- `[x]` **GAP-F2 DONE (see line 118: baseline stamped on staging, migrate deploy exercised)** was: Needs its own planned change, not a drive-by:
  baseline the live schema (`migrate diff` → initial migration), `migrate resolve --applied` against
  staging + prod, add a migration step to the deploy pipeline, THEN delete `ensurePrismaTables()`.
  **Risk:** the DB holds real learner progress; a botched cutover means a failed deploy or data loss.
  Do it with a fresh backup and a quiet window. Until then `ensurePrismaTables()` is idempotent and safe.
- `[x]` **GAP-H2 DONE (see line 126)** was: Mechanical but a large diff across
  `ConfigAdminManager`, `ConfigEditorDrawer`, `GuidedInternalNameBuilder`, `RichTextEditor`.
  **Risk:** a mistranslated hex→token silently changes the UI, so it needs visual verification against
  `/previews/components` after. Best done in one focused pass, not interleaved with feature work.

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

## CS-7: Report Scheduling (2026-07-23) - SHIPPED
Recurring "generate + email" report schedules per docs/coming-soon-features-spec.md #7,
with the two-layer recipient model the operator approved (per-schedule recipients; pickers
fed from the admin team + the reports.recipient_directory option set).
- `[x]` CS7-1: `report_schedules` table (Prisma model + migration `20260723120000_report_schedules` applied on staging + ensurePrismaTables mirror).
- `[x]` CS7-2: Config seeds published to staging: `reports.cadence_options` (metadata drives next-run), `reports.recipient_directory` (sample shipped disabled), `reports.schedule.email_subject` / `.email_body` ({{placeholder}} templates).
- `[x]` CS7-3: Admin CRUD + run-now under `/api/admin/reports/schedules` (create/delete admin-only; pause/resume/run editor+; audit-logged with actor fallback to JWT sub).
- `[x]` CS7-4: Worker engine in `backend/src/reports/schedule-service.ts`: optimistic nextRunAt claim (no cross-instance double-send), slot-keyed export requestId, per-recipient email with CSV attachment, no backlog replay, cadence-gone parking. Dispatch route `/internal/reports/schedules/dispatch` (worker token, payouts pattern).
- `[x]` CS7-5: Cloud Scheduler job `shetrades-reports-dispatcher-staging` (*/15, Africa/Lagos) created and ENABLED.
- `[x]` CS7-6: Dashboard: `ReportScheduleDrawer` (preset + cadence + two-source recipient picker + validated one-off email), live Scheduled Jobs card (list, pause/resume, run now, delete w/ confirm), gallery story. Verified in browser.
- `[x]` CS7-7: 9 new backend tests (next-run engine incl. month clamping, cadence metadata contract, input normalisation, email templating, dispatch guard) - suite 411/0 fail/42 skipped.
- `[x]` CS7-8: Staging e2e: created weekly Partner schedule, run-now returned status "sent" ("Sent donor_summary-2026-07-23.csv to tar112@gmail.com"), dispatch tick {due:0} with token + 403 without, schedule left PAUSED for operator inspection.

## Next phase: White-label readiness (SPECCED 2026-07-23, awaiting go-ahead)
Spec: docs/white-label-readiness-spec.md. Audit found the load-bearing surfaces
already config-driven; this phase clears the residue. Do WL-1..3 first, pause
for review before WL-4.
- `[ ]` WL-1 (S, defect): privacy fallback renders `("SheTrades","we","us")` for any org + shetrades.digital fallback emails - make fallbacks org-neutral (dashboard/app/privacy/page.tsx:40, backend/src/notifications/help-request-email.ts:60).
- `[ ]` WL-2 (S/M): operator-visible string sweep - simulator assistant name/default text, config phone mocks, SMTP fromName defaults, payouts placeholders, greeting-trigger list -> `bot.greeting_triggers` option set. Plumbing names (X-SheTrades-Source, package names, tour keys) explicitly KEPT.
- `[ ]` WL-3 (M): docs/new-tenant-runbook.md - single ordered checklist to stand up a new org (GCP, SQL+secrets, deploy, migrate, Meta, SMTP, Vercel, seed order, admin bootstrap, both Scheduler jobs, smoke tests) + sanitised cloudrun-env.example.yaml.
- `[ ]` WL-4 (M, on client demand): logo upload in branding.identity (data-URI <=48KB, SVG sanitised, draft/publish preview, initials-mark fallback).
- WL-5 custom font upload: DEFERRED.

Undecided (not in this phase until operator says go):
- Messaging-cost Option A auto-advance (~18% per-learner saving, pacing trade-off).

## Pre-launch reminders (operator)
- `[x]` N100 Termii experiment RUN 2026-08-15 - VERDICT: **Termii has NO airtime API.** The adapter's dispatch endpoint was fictional; 3 real attempts all returned HTTP 404, N0 spent (wallet intact at N2,820.70). Termii docs list messaging/OTP products only. ACTION: switch payouts provider to Reloadly or Africas Talking (both adapters already built, real hosts; Reloadly has a true sandbox), and ask Termii about the N2,820 wallet balance (only usable for their messaging products).
- `[x]` Africas Talking configured + adapter FIXED 2026-08-15 (AT contract wants combined amount "NGN 100" string, txn id = requestId; rev 00109-cbd). Sandbox e2e PROVEN: reward 1356ac79 -> Issued, ATQid_473087d9... Zero cost.
- `[x]` Payouts go-live: airtime ENABLED on the live AT Nigeria account 2026-08-18 and PROVEN with a real payment - NGN 100 to +2349056895713 via the published live config, ATQid_edb70dbb4409545550e2b920d2cd2c3d, wallet NGN 105.18 -> NGN 8.18, and DELIVERY CONFIRMED on the handset (not just gateway acceptance). NGN 100 of airtime costs NGN 97.00 (AT reseller discount ~3%). REMAINING OPERATOR ACTION: top up the AT wallet - NGN 8.18 left, so the next real reward fails on insufficient balance (parks non-retryably with the real reason).
- `[x]` CERT Phase 1: completion certificates - schema, pure core, template contract, layout engine (wrapped body text, inline bold, ordinal dates), sharp renderer, issuing service, public verify page + png route, bot confirm-name flow with an earned-only menu row, the client's real artwork in Roboto, and the admin surface. 237 tests. Deployed to staging rev 00119-w5c; assets seeded and the template published at v1 with enabled:false. OPERATOR ACTION: republish with enabled:true to start issuing, and run one real learner through the bot end to end.
- `[ ]` CERT Phase 2: /certificates canvas template editor (upload background, drag fields). Authors the same config document; the preview must be the server render, not the browser's.

## OPT: Visual option-set editor (COMPLETED 2026-08-15)
Operator request: friendlier UI than raw JSON for config option sets (FAQs etc.).
- `[x]` OPT-1: dashboard/lib/option-set-builder.ts (pure parse/serialize, metadata field classifier, verbatim round-trip of unknown shapes) + components/config/OptionSetBuilder.tsx (card-per-option editor, auto-slug, reorder, 24-char row-title meter + >10 rows warning for bot.* sets, "Add detail" field types).
- `[x]` OPT-2: ConfigEditorDrawer documentType prop; option_set docs open in the visual wizard by default with Raw JSON behind the existing toggle; wizard-only serialize (no textarea rewrites mid-typing); save gated on validation. Fixes latent en-corruption when opening items-shaped payloads in the generic parser.
- `[x]` OPT-3: ConfigAdminManager passes documentType (edit + create); buildCategoryPayload preserves item metadata (was hardcoded to {} - would have wiped FAQ answers on a category-drawer save).
- `[x]` OPT-4: Preview gallery card (standalone builder + real drawer instance on a bot.faqs fixture); browser-verified round trips both directions; tsc + production build clean; no backend changes.

## RS: Resources menu (COMPLETED 2026-08-15)
Client request: vetted-resources directory in the bot menu, rich-text managed.
- `[x]` RS-1: resources_menu bot flow mirroring faq_menu; main menu row 5; prompts EN/PCM/IG. Rev 00112.
- `[x]` RS-2: bot.resources option set published (2 samples DISABLED for the client to replace); fieldHints added to the option_set contract (would otherwise be stripped by the publish validator).
- `[x]` RS-3: OptionSetBuilder renders fieldHints:"richtext" text fields with RichTextEditor (WhatsApp markdown); bot.faqs answers hinted too. Browser-verified markdown round-trip.
- `[x]` RS-4: 3 new handler tests (suite 444/0); staging e2e of every leg incl. empty state; docs.
- `[ ]` CLIENT: replace the two disabled sample entries with vetted providers (Settings -> Configuration -> Options -> Bot Resources) and enable them.

## LANG: Coming-soon languages (COMPLETED 2026-08-15)
- `[x]` bot.language_options config-driven language step: comingSoon metadata flag -> 🔜 button suffix + polite decline on all selection paths; enabled flag hides. Seeded pcm/ig comingSoon:true, published. Rev 00113, suite 446/0, e2e both entry paths.
- `[ ]` WHEN TRANSLATIONS LAND: untick Coming Soon on Pidgin/Igbo in dashboard -> Options -> "Bot language choices" -> publish. No deploy.

## PROD-PREP (COMPLETED 2026-08-17)
- `[x]` Cloud SQL daily backups + PITR enabled (7-day retention); were OFF with zero backups - a production blocker. Pre-cleanup on-demand backup 1786961045198 retained permanently.
- `[x]` Learner/test data cleared via `npm run ops:reset-learner-data -- --confirm`: 672 rows removed, all content/config/admin/translation tables verified unchanged, post-cleanup bot smoke test green, learner tables at 0.

## SEC: Webhook auth hardening (COMPLETED 2026-08-17)
- `[x]` Closed the anonymous sandbox bypass on POST /webhook/whatsapp (header alone used to skip signature checks and could mint reward rows). Now requires X-SheTrades-Sandbox-Token vs WHATSAPP_SANDBOX_TOKEN; sandbox disabled entirely when the env var is unset.
- `[x]` Signature verification now FAILS CLOSED (503) when no appSecret is configured instead of trusting the request; operator set the app secret.
- `[x]` 6 new webhook auth tests (there were none for signature verification before). Suite 450/0. Rev 00115-jm7, verified live.
- `[ ]` FOLLOW-UP: the dashboard's WhatsApp simulator sends only X-SheTrades-Source and will now be rejected against staging - wire the sandbox token in (or point it at a local backend) before relying on it.

## GO-LIVE: WhatsApp number migration (runbook ready, awaiting client decision)
Runbook: docs/whatsapp-number-golive-runbook.md
- `[ ]` BLOCKING DECISION: confirm in writing whether the business number is currently used for HUMAN conversations. A number cannot be on the WhatsApp Business App and the Cloud API at once - migrating means nobody can use the app with it again and chat history is lost. If staff chat on it, use a separate number for the bot instead.
- `[ ]` Phase 1-2: free the number from the Business App (backup chats, disable 2SV, delete account) and register it on the Cloud API under WABA 991712293855596 with the CAC-matching display name.
- `[ ]` Phase 3: swap Phone Number ID in Settings -> Integrations -> WhatsApp (token/WABA/verify token/app secret all unchanged), Test Connection, Publish.
- `[ ]` Phase 4: prove end-to-end from a real handset before opening the doors.
- `[ ]` Phase 5: add a payment method to the WABA (sends fail without it), clear test data, share the number/QR.

## GO-LIVE: WhatsApp number migration (runbook ready, awaiting client decision)
Runbook: docs/whatsapp-number-golive-runbook.md (verified against Meta's Graph API 2026-08-17)
Finding: the portfolio has TWO WABAs. The real number +234 803 512 5590 lives in the
"Techherng" WABA (1105900442606502) as ON_PREMISE/DISCONNECTED; our app is connected to
the auto-created "Test WhatsApp Business Account" (991712293855596). Plan is to move to
the Techherng WABA, not to move the number into the test one.
- `[x]` CONFIRMED 2026-08-17: the WhatsApp Business App IS installed on a handset with +234 803 512 5590, so Phase 1 (handset account deletion) IS required. WAITING on the client to back up chats, note the two-step PIN, disable two-step verification, and delete the account from the app. STILL WORTH CONFIRMING whether it is an ACTIVE support line - if staff reply to people on it by hand, migrating removes that channel permanently and a separate number for the bot is the better call.
- `[ ]` Confirm the display name: the number's verified name is already "Techherng" - does that match the CAC doc? If so the naming decision is already made.
- `[ ]` Phase 1-2: free the number from the Business App if needed, then register it on Cloud API under WABA 1105900442606502.
- `[ ]` Phase 3 (EASY TO MISS): subscribe the SheTrades Bot app to WABA 1105900442606502. Webhook subscriptions are per-WABA and that account currently has NO subscribed apps - without this the bot is silently deaf.
- `[ ]` Phase 4: update BOTH phoneNumberId AND businessAccountId in Settings -> Integrations -> WhatsApp; Test Connection; Publish.
- `[ ]` Phase 5: prove end-to-end from a real handset while the allowlist still protects you.
- `[ ]` Phase 6: payment method on the Techherng WABA, clear test data, regenerate the QR poster with the real number.

## 🛑 LAUNCH BLOCKER: Meta business verification (discovered 2026-08-17)
The WhatsApp account is RESTRICTED until the SheTrades Digital Project portfolio is
verified: cannot start conversations, cannot respond to customers, CANNOT ADD PHONE
NUMBERS. Not a violation and nothing to appeal - it is Meta's standard unverified-portfolio
restriction ("Permanent" = until verified). API confirms the account is otherwise healthy
(ACTIVE / APPROVED / business_verification_status: not_verified).
- `[ ]` TECHHER: complete business verification (Business portfolio -> WhatsApp account -> Start Verification). Needs CAC certificate + proof of address + utility bill/bank statement matching the registered name. THIS NOW BLOCKS EVERYTHING - number registration, display name, and higher messaging limits all depend on it.
- Verified 2026-08-17 that the TEST number still sends and receives normally (real inbound traffic reached the platform), so client UAT can continue meanwhile. Only launch is blocked.
- Note: the Techherng WABA (1105900442606502) disappeared when the client deleted the WhatsApp Business App account, so the plan simplifies - register the real number into the EXISTING test WABA (991712293855596), which the app is already webhook-subscribed to. Only `phoneNumberId` changes in config, not `businessAccountId`, and the app-subscription step is no longer needed.

## SEC: Login rate limiting (COMPLETED 2026-08-18)
Gap found during 2FA planning: /auth/login had no throttling at all.
- `[x]` RL-1: auth_throttle table (Postgres-backed for multi-replica safety) + migration + ensurePrismaTables mirror.
- `[x]` RL-2: pure throttle-policy engine (sliding window, exponential lockout with ceiling, env-tunable) + 10 unit tests.
- `[x]` RL-3: wired into login - checked before the account lookup, recorded for unknown AND known addresses (no enumeration oracle), cleared on success, 429 + Retry-After.
- `[x]` RL-4: `trust proxy` set to 1 for Cloud Run. Throttle keys on EMAIL not IP deliberately - a mis-derived client address would let one attacker lock out every admin.
- `[x]` RL-5: 5 route tests, suite 465/0, rev 00116-vfm, verified live (lockout, countdown, per-account isolation, case-rotation resistance).
- `[ ]` Periodic prune of auth_throttle rows (harmless accumulation, hygiene only).
- `[ ]` NEXT: 2FA (TOTP) per the agreed plan - see handoff.md.

## SEC: TOTP two-factor authentication (BACKEND COMPLETE 2026-08-18)
- `[x]` 2FA-1: TOTP/HOTP + base32 + AES-256-GCM secret sealing, verified against the published RFC 4226 and RFC 6238 test vectors (18 tests).
- `[x]` 2FA-2: AdminAccount TOTP columns + migration + ensurePrismaTables mirror (all nullable - existing admins are unaffected).
- `[x]` 2FA-3: two-step login. authenticateJwt now REJECTS challenge tokens - the property the whole feature rests on (7 tests).
- `[x]` 2FA-4: setup/enable/disable/status/recovery-codes endpoints + admin-assisted reset-2fa mirroring reset-password.
- `[x]` 2FA-5: DASHBOARD UI shipped - login code step (accepts TOTP or recovery code), profile Two-factor card (client-side QR, manual key, one-time recovery codes, regenerate/turn-off), Admins tab Reset 2FA action. Browser-verified end to end against staging on a throwaway account.
- `[x]` 2FA-6: suite 490/0, rev 00117-hn4, 12/12 live checks on a throwaway admin.
- `[ ]` Enforcement policy (require 2FA for the admin role) - config-driven, currently opt-in per account.
