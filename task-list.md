# SheTrades - Content Admin Wizard Refactoring Tracker

This checklist tracks the design and implementation of the premium step-wizard editor form inside the Admin settings panel to completely replace raw JSON configurations for non-technical admins.

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
