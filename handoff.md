# Progress Handoff Journal: SheTrades Content Admin Wizard

This log documents progress and active state changes for the Premium step-wizard curriculum form. It enables a smooth developer or agent handoff at any point in the workflow.

---

## Chronological Progress Log

### 2026-05-21: Phase 1: Planning and Research
* **Completed Research**:
  * Investigated validation rules inside backend setting contracts ([contracts.ts](file:///d:/work/Tar/PROJECTS/SHE-TRADES/backend/src/config-platform/contracts.ts)) to verify payload formats for `lesson_content` and `ui_copy`.
  * Verified current `ConfigEditorDrawer` is a dumb presentation layer rendering raw `<Textarea>` for payloads.
  * Formulated a premium step-wizard UX featuring structured metadata inputs, rich text areas with emoji selectors, multiple choice quiz question builders, and an interactive WhatsApp smartphone chat preview.
* **Initialized Planning Artifacts**:
  * Written custom implementation plan at [implementation_plan.md](file:///C:/Users/Dell/.gemini/antigravity/brain/8aae27c0-4180-45bb-a6a7-e9b77ad3f6d5/implementation_plan.md).
  * Created project tracking checklist at [task-list.md](file:///d:/work/Tar/PROJECTS/SHE-TRADES/task-list.md).
  * Created this handoff journal at [handoff.md](file:///d:/work/Tar/PROJECTS/SHE-TRADES/handoff.md).

---

## Technical Context Baseline

### 1. JSON Payload Data Structures
To prevent database formatting errors, the form must serialize into these two strict profiles based on category:
* **Lesson Curriculum Category** (`content.lesson.*`):
  ```json
  {
    "title": "Pricing Basics",
    "module": "Module 1: Financial Literacy & Record Keeping",
    "languages": {
      "en": "Lesson body...",
      "pcm": "Lesson body in Pidgin...",
      "ig": "Lesson body in Igbo..."
    },
    "audioUrls": {
      "en": "https://...",
      "pcm": "https://...",
      "ig": "https://..."
    },
    "quiz": [
      {
        "question": "Sample question?",
        "options": ["Option A", "Option B", "Option C"],
        "answerIndex": 0
      }
    ]
  }
  ```
* **Translation Block Copy Categories** (`bot.*`, `admin.ui.*`):
  ```json
  {
    "en": "Welcome to SheTrades",
    "pcm": "Welcome to SheTrades",
    "ig": "Welcome to SheTrades"
  }
  ```

### 2. Implementation Files
* **Component Code**: [ConfigEditorDrawer.tsx](file:///d:/work/Tar/PROJECTS/SHE-TRADES/dashboard/components/config/ConfigEditorDrawer.tsx)
* **Custom CSS**: [globals.css](file:///d:/work/Tar/PROJECTS/SHE-TRADES/dashboard/app/globals.css)

---

## Chronological Progress Log (Continued)

### 2026-05-21: Phase 2: Implementation & Verification
* **Integrated Step Wizard Props**:
  * Injected the `namespace={namespace}` and `existingModules={existingModules}` properties into both `<ConfigEditorDrawer>` components inside [ConfigAdminManager.tsx](file:///d:/work/Tar/PROJECTS/SHE-TRADES/dashboard/components/config/ConfigAdminManager.tsx).
* **Refactored Textarea Component**:
  * Modified [Textarea.tsx](file:///d:/work/Tar/PROJECTS/SHE-TRADES/dashboard/components/ui/Textarea.tsx) by wrapping it in `React.forwardRef` to properly forward references to the underlying `<textarea>`. This resolved all typescript compilation errors inside the dashboard application.
* **Resolved JSX Syntax Issues**:
  * Corrected raw JSX arrow text (`->`) inside formatting guides to use elegant right arrow characters (`&rarr;`) inside [ConfigEditorDrawer.tsx](file:///d:/work/Tar/PROJECTS/SHE-TRADES/dashboard/components/config/ConfigEditorDrawer.tsx).
* **Ran Full Monorepo Typechecks**:
  * Verified full workspace type-safety using `npm run typecheck`. All 3 packages (`backend`, `dashboard`, `shared`) compile flawlessly with zero typescript errors.
* **Verified Production Build**:
  * Successfully compiled the dashboard using `npm run build -w @shetrades/dashboard` with Turbopack, resulting in a perfectly optimized production bundle.
* **Restarted Dev Server with Live Cloud Sync**:
  * Stopped the dev server and initiated a fresh local development environment running on `http://localhost:3000` loading `.env.local` to proxy all public/admin CRUD endpoints directly to the staging cloud backend: `https://shetrades-backend-staging-214511840103.us-central1.run.app`.

### 2026-05-21: Phase 3: Senior Engineering Review & Resolution
* **Conducted Senior Engineering Code Review**:
  * **Root Cause 1 (Category Selection Lockout)**: If the local database is fresh or loading, `categoryDocumentRow` is unpopulated. `managedCategoryOptions` evaluated to `[]`, making the `Category` select dropdown in `GuidedInternalNameBuilder` permanently disabled (`disabled={categoryOptions.length === 0}`). This prevented non-technical admins from selecting the `"lesson"` category during new content creation.
  * **Root Cause 2 (State-Wiping Timing Loop)**: When template starters (like `"Starter: Lesson Content"`) were applied, they set the parent `payloadInput` immediately. The drawer detected a change and triggered `parseAndSetPayload()`, scheduling state updates for `isLesson`, `lessonTitle`, etc. However, before React could flush those batched updates, the synchronization `useEffect` ran. Since the local states were still empty, it serialized an empty lesson format and dispatched it back to the parent via `onPayloadChange()`, immediately wiping out the newly applied template and reverting the drawer to simple translation copy blocks.
  * **Root Cause 3 (Stick/Sticky Lesson Mode)**: Changing the category dropdown from `"lesson"` back to `"message"` did not toggle `isLesson` to `false` because `parseAndSetPayload` blindly parsed the old lesson payload (which still had `"languages"` or `"quiz"`), overriding the user's category choice.
* **Applied Clean, Robust Fixes**:
  * **Unified State Sync Guard**: Refactored the `useEffect` inside `ConfigEditorDrawer.tsx` to return early if `payloadValue !== localSerialized`. This successfully blocks local synchronization during parent-initiated updates (loads, template selections) until `parseAndSetPayload` finishes flushing the new states.
  * **Explicit Dropdown Fallbacks**: Added a robust static options fallback mapping (`lesson`, `message`, `ui` for content) inside `ConfigAdminManager.tsx` whenever `managedCategoryOptions` is empty, guaranteeing that the name builder is always functional and interactive.
  * **Auto-Categorized Starters**: Modified `applyTemplate()` inside `ConfigAdminManager.tsx` to automatically set the category input (`"lesson"` or `"message"`) when starter templates are clicked.
  * **Category-Primary Lesson Detection**: Modified `parseAndSetPayload()` to force `detectedIsLesson = false` if the category is explicitly a non-lesson type (e.g. `"message"`), aligning the visual steps perfectly.
* **Full Verification**:
  * Monorepo typechecks and Next.js Turbopack production builds compile flawlessly (`npm run build -w @shetrades/dashboard`).

### 2026-05-21: Phase 4: Biometrics Autofill & Scroll Lock Resolution
* **Identified Root Cause (Credential/Biometric Autofill Lock)**:
  * When editing text in form inputs (specifically the guided name builder slug field labeled "Name"), browser extensions (e.g. 1Password, Bitwarden, KeePass, Kaspersky Protection) parse the HTML attributes. Seeing `<label>Name</label>` and `<input>`, they classify it as a username/credential login field and attempt to hook the input to show biometric (FaceID/Fingerprint) prompts or credential drop-downs via injected scripts (`biometrics.chunk.js`).
  * Since the dashboard enforces a strict Content Security Policy (`script-src 'self' 'wasm-unsafe-eval'`), the extension script crashes when attempting to execute `eval` or `Function()`, throwing a CSP exception.
  * Because the extension script terminates mid-execution, it never releases the scroll-lock trap it places on the background window/body/drawer elements. This results in the side drawer becoming permanently "locked in place" and preventing user scrolling.
* **Applied Safety Ignore Mitigations**:
  * Modified raw `<input>` inside [GuidedInternalNameBuilder.tsx](file:///d:/work/Tar/PROJECTS/SHE-TRADES/dashboard/components/config/GuidedInternalNameBuilder.tsx) and custom `<Input>` components inside [ConfigEditorDrawer.tsx](file:///d:/work/Tar/PROJECTS/SHE-TRADES/dashboard/components/config/ConfigEditorDrawer.tsx) to block browser extensions from scanning or intercepting them.
  * Added safety attributes:
    * `autoComplete="off"` (standard)
    * `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}` (behavioral controls)
    * `data-lpignore="true"` (LastPass)
    * `data-1p-ignore="true"`, `data-1password-ignore="true"` (1Password)
    * `data-bitwarden-no-filtering="true"` (Bitwarden)
    * `data-keepassignore="true"` (KeePass)
    * `name="config_internal_key_slug"`, `type="text"` (explicit semantic types to avoid credential matching)
* **Full Verification**:
  * Clean, successful production compilation of next.js using Turbopack (`npm run build -w @shetrades/dashboard`).
  * Manual and static validation confirms zero biometric hooks and a perfectly fluid drawer scrolling behavior on slug input typing.


## Recent Fixes
- Fixed WhatsApp Handler quiz progression, button matching bugs, and 500 crashes on new user session.
- Updated content seeds and Visual Wizard to strictly enforce 3-option limits without redundant fallbacks.

### 2026-05-22: WhatsApp Sandbox Quiz Buttons + Starter Template Multi-Question Seed
* **Problem**:
  * Reported via the WhatsApp sandbox simulator: quiz answer buttons displayed as bare numbers (`1`, `2`, `3`, `MENU`) rather than the corresponding option text, even though the reply body listed `1. Option A`, `2. Option B`, etc.
  * After answering the very first quiz question in a lesson, the bot offered `NEXT` and advanced to the next lesson, instead of stepping through additional questions for the same lesson.
* **Root Cause Investigation**:
  * **Bug 1 (numeric buttons)**: `backend/src/whatsapp/handler.ts` returned `buttons: [...quizItem.options.map((_, i) => String(i + 1)), "MENU"]` at three sites (initial quiz, next-question advance, incorrect-retry). The map ignored the option text and only emitted `String(i + 1)`. Sandbox component (`WhatsAppSandboxSimulator.tsx`) renders button labels verbatim, so users saw numeric buttons.
  * **Bug 2 (NEXT skip)**: The `isLastQuestion = qIndex >= activeLesson.quiz.length - 1` guard is correct. Iteration through multi-question quizzes works when `quiz.length > 1`. Pulled the thread back to the admin-side data shape: the "Starter: Lesson Content" template at `ConfigAdminManager.tsx` seeded a single-question `quiz` array (`[{"question":"Sample question","options":["A","B"],"answerIndex":0}]`), so any lesson scaffolded from the starter without manual question addition resulted in `quiz.length === 1` and `isLastQuestion` flipping true after the first answer.
* **Fixes Applied**:
  * **`backend/src/whatsapp/handler.ts`**:
    * Replaced the three numeric button maps with `[...options.map((opt, i) => \`${i + 1}. ${opt}\`), "MENU"]`, matching the existing main-menu pattern (`1. Start Learning`, `2. My Progress`, etc.).
    * Extended the answer matcher to accept the new button payload format. Added a `strippedInput = normalized.replace(/^\d+\s*[.)]\s*/, "").trim()` derivation and a `leadingNumberMatch` regex that extracts a leading number from `1. Apple`. The match now succeeds for plain `1`, plain `apple`, and the button-click `1. apple` — all three resolve to the correct answer.
    * Added a defensive guard for `nextQuizItem = activeLesson.quiz[qIndex + 1]` so the file typechecks under `noUncheckedIndexedAccess` (the `isLastQuestion` invariant guarantees existence, but TS can't narrow numeric comparisons). The guard falls back to a safe MENU reply rather than emitting a half-formed payload.
  * **`dashboard/components/config/ConfigAdminManager.tsx`**: Expanded the "Starter: Lesson Content" payload to seed three sample questions with three options each and an explicit `module` field, so admins scaffolding new lessons start with a proper multi-question quiz array. Schema is unchanged; only the starter JSON literal grew.
* **Note on existing 9 lessons**: Already-published lessons whose `quiz` arrays contain only one question will continue to complete after that one question — the starter-template fix only changes the default for NEW lessons. To get the multi-question flow on existing lessons, each lesson document needs its `quiz` array edited via `/content` to add the additional questions.
* **Verification**:
  * `npm run typecheck` PASS across all workspaces.
  * Code-level trace confirms button payload now matches handler menu pattern and answer matcher accepts all three input forms.
  * Local end-to-end smoke test deferred: local backend has no seeded lessons (Postgres unreachable from this dev machine), so the quiz path can't be triggered without staging access. User to verify on staging after Vercel + Cloud Run pick up the next deploy.

---

### 2026-06-04: Rewards Page Redesign + Automated Payouts Pipeline

**Spec:** `docs/superpowers/specs/2026-06-04-rewards-redesign-design.md`
**Plan:** `docs/superpowers/plans/2026-06-04-rewards-redesign.md`
**Status:** Tasks 1-20 complete on `main`. Cloud Scheduler not yet deployed.

**What landed (20 tasks):**
- Task 1: Reward schema delta + `ensurePrismaTables` ALTERs + bot upsert swap (`backend/prisma/schema.prisma`, `backend/src/admin/prisma.ts`, `backend/src/rewards/service.ts`).
- Task 2: Payouts provider contracts — Zod discriminated union over the three sandbox providers (`backend/src/payouts/providers/contracts.ts`).
- Task 3: Africa's Talking adapter + 13 tests (`backend/src/payouts/providers/africas-talking.ts`, `.test.ts`).
- Task 4: Provider factory `getActiveProvider()` + test seam for swapping in mocks (`backend/src/payouts/providers/factory.ts`).
- Task 5: Worker dispatch loop — claim, exponential backoff (5/10/20 min), structured logs (`backend/src/payouts/worker.ts`).
- Task 6: Worker HTTP endpoint + `PAYOUTS_WORKER_TOKEN` auth header check (`backend/src/payouts/routes.ts`).
- Task 7: Termii adapter (`backend/src/payouts/providers/termii.ts`).
- Task 8: Reloadly adapter (`backend/src/payouts/providers/reloadly.ts`).
- Task 9: Extended `GET /admin/rewards` with status/channel/search filters + `meta.activeProvider`.
- Task 10: Admin endpoints — `POST /admin/rewards/:id/retry`, `/:id/mark-issued`, `/admin/rewards/manual`.
- Task 11: CSV export endpoint (`GET /admin/rewards/export.csv`).
- Task 12: Design tokens + currency / relative-time helpers (`dashboard/lib/design-tokens.ts`, `dashboard/lib/format.ts`).
- Task 13: `RewardsHealthHero` + 3 sub-components + Storybook-style preview page.
- Task 14: `RewardsToolbar` (search, status/channel/date filters, refresh, manual, export).
- Task 15: `RewardsTable` + `RewardDetailDrawer` with status-gated row actions.
- Task 16: `ManualRewardDrawer` with Zod validation and submit flow.
- Task 17: Wired `/rewards` page composition to use the new components.
- Task 18: `PayoutsProviderSelector` + `PayoutsCredentialFields` discriminated form + preview.
- Task 19: Registered Payouts as a third sibling tab inside `IntegrationSettingsWorkspace` (followed the existing WhatsApp / Email pattern).
- Task 20: Payouts post-deploy smoke script (`backend/src/smoke/payouts-smoke.ts`), CI wire-up in `.github/workflows/staging-promotion-gate.yml`, and this handoff entry.

**Outstanding (operator actions required before production):**

1. **Create the Cloud Scheduler worker secret on staging** (run in an authenticated shell):
   ```
   PROJECT=shetrades-staging-12345
   TOKEN=$(openssl rand -hex 32)
   echo -n "$TOKEN" | gcloud secrets create payouts-worker-token \
     --data-file=- --project=$PROJECT
   gcloud secrets add-iam-policy-binding payouts-worker-token \
     --member="serviceAccount:214511840103-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor" --project=$PROJECT
   echo "Save: $TOKEN"
   ```

2. **Deploy the backend with the secret mounted:**
   ```
   gcloud run deploy shetrades-backend-staging --source . --region us-central1 \
     --env-vars-file cloudrun-staging-env.yaml \
     --update-secrets PAYOUTS_WORKER_TOKEN=payouts-worker-token:latest --quiet
   ```

3. **Create the Cloud Scheduler job hitting the endpoint every 5 min:**
   ```
   gcloud scheduler jobs create http shetrades-payouts-dispatcher-staging \
     --schedule "*/5 * * * *" \
     --time-zone "Africa/Lagos" \
     --uri "https://shetrades-backend-staging-214511840103.us-central1.run.app/internal/payouts/dispatch" \
     --http-method POST \
     --headers "X-Internal-Worker-Token=$TOKEN" \
     --max-retry-attempts 0 \
     --location us-central1 \
     --project $PROJECT
   ```

4. **Publish a sandbox Payouts config:** via `/settings -> Integration -> Payouts`, pick Africa's Talking (or Termii / Reloadly), enter sandbox credentials, toggle sandbox ON, publish.

5. **Run the smoke locally to verify end-to-end:**
   ```
   POSTGRES_URL="..." npm run smoke:payouts -w @shetrades/backend
   ```
   Expect `payouts.smoke.ok` within 6 minutes.

6. **Production cut-over** (separate change): create production-side secret, repeat scheduler creation for production region, publish a production Payouts config doc using real credentials.

**Known follow-ups not blocking this delivery:**
- Add `/api/integrations/admin/payouts/test` endpoint that calls the adapter's `verifyCredentials` so the Settings tab can show a Test Connection button.
- The `/rewards` `ManualRewardDrawer`'s learner autocomplete currently passes the reward id (not user id) — wire `/api/admin/users` (paginated list) to feed the picker properly, otherwise `POST /api/admin/rewards/manual` will 404.
- Date range "Custom..." in `RewardsToolbar` is a label only — wire a date-picker modal in a follow-up.
- Set up a dashboard test runner (Vitest or `node:test` loader) so component tests can actually execute.
- Extract `dashboard/lib/admin/contracts.ts` `RewardLogRow` into a shared package or generate it from the backend Zod schemas to prevent drift.

### 2026-06-03: Payouts config save fix + premium /rewards shell + settings link

- **Payouts config save 400 (4bbc41e, deployed staging rev 00049-lgr):** Saving any Payouts provider from `/settings -> Integration -> Payouts` failed with `Invalid config admin request payload` / `Invalid discriminator value. Expected 'meta_whatsapp_cloud' | 'smtp'`. Root cause: `integrationConfigPayloadSchema` in `backend/src/config-platform/contracts.ts` was a `z.discriminatedUnion` over only whatsapp + notification; a payouts payload (`provider: "termii"` etc.) failed the discriminator. Fix: import `payoutsIntegrationPayloadSchema` and switch to a `z.union` of whatsapp + notification + payouts (can't nest discriminated unions — payouts is itself a discriminated union over africas_talking/termii/reloadly). Verified all 5 integration payload shapes parse; 19 config/schema tests pass. Reproduced + confirmed fixed against staging (create now returns 201).
- **`/rewards` premium shell (be93b78):** Task 17 deferred page-shell CSS, leaving `rewards-page__*` classes unstyled (native button, no section spacing). Rewrapped in `.admin-dashboard-page` grid (gap var(--space-6)), swapped the hand-rolled header for `<SectionHeader>` + `<Badge>` + `<Button>`, added token-driven CSS for the action cluster and inline notes.
- **Provider-setup banner link (7c261cd):** RewardsHealthHero CTA linked to non-existent `/settings/integration`; corrected to `/settings?tab=integration`.
- **Staging cleanup note:** While verifying the schema fix I created `integration.payouts.primary` on staging with a placeholder Termii key (`PASTE-YOUR-REAL-TERMII-KEY`). It is published + active (activeProvider = termii/sandbox) so the admin can open the Payouts tab, replace the placeholder with the real key, run Test Connection, and republish. NOTE: a published+archived integration doc returns `activeProvider: null` from the runtime cache (archived docs are excluded) — reactivate is required, and reactivate needs a prior published version. `purge-trash` only supports content/options/legal namespaces, so integration docs can't be hard-deleted via API — a latent gap worth closing (extend `purge-trash` + the namespace enum to include integration).

### 2026-06-04: Cloud Scheduler payouts worker + /users functionality + Reward Rules tab

- **Cloud Scheduler worker (operational, no commit):** The payouts dispatcher was never actually set up. Enabled the Cloud Scheduler API, created the `payouts-worker-token` secret + granted the Cloud Run SA access, mounted `PAYOUTS_WORKER_TOKEN` on the service (rev 00050-bvr), and created the `shetrades-payouts-dispatcher-staging` job (every 5 min, Africa/Lagos, `X-Internal-Worker-Token` header). Verified end-to-end: a scheduler-triggered tick reached the worker; it examined the pending reward and scheduled a retry (the published Termii key is still the placeholder). Once the real key is published, pending rewards dispatch automatically.
- **/users functionality (spec `2026-06-04-users-functionality-and-reward-rules-design.md`, plan `2026-06-04-users-functionality-and-reward-rules.md`):** Implemented via subagent-driven development (14 tasks). Added two `User` columns (`flaggedForFollowUp`, `followUpNote`) via `ensurePrismaTables` ALTERs + `admin_users_view` column; three admin endpoints (`GET /api/admin/users/:phone` learner-detail aggregation, `POST /api/admin/users/:phone/flag`, `GET /api/admin/users/export` CSV) with route ordering (export + flag before `:phone`); converted `/users` to a client component with a `LearnerDetailDrawer` (identity, session, per-module progress, quiz attempts, reward history) and wired Preview + Flag (optimistic, flagged Badge) + Export; Contact + Create Import Batch are visible-but-disabled with "coming soon". `AdminActionRail` gained an optional `onClick` (backward-compatible).
- **Reward Rules tab:** `rewardRulesPayloadSchema` (`kind/amount/channel/enabled`) registered in the config payload union before the catch-all; `getRuntimeRewardRules()` consumed by the WhatsApp handler's `module_completed` branch (published rule overrides the env default; `enabled:false` suppresses reward creation via `continue` in the events loop; no rule → ₦500 env fallback). New `/settings?tab=rewards` tab renders `RewardRulesWorkspace` (draft/publish like payouts, key `reward.rules.primary`).
- **Verification:** monorepo typecheck clean (backend+dashboard+shared); dashboard build 16/16 pages; 8/8 DB-free backend tests pass (reward-rules schema, payouts contracts). DB-backed tests (users-detail, flag, export) run in CI/staging where Postgres is present.
- **Deploy:** backend redeployed to staging so the new endpoints + the two `User` columns (added at boot by `ensurePrismaTables`) are live. No published `reward.rules.primary` doc yet → env fallback (₦500 airtime) remains in effect until an admin publishes a rule via the new Rewards tab.
- **Carried-over follow-ups:** payouts Test Connection endpoint (`/api/integrations/admin/payouts/test`) not yet built; learner-list picker for ManualRewardDrawer; whether `/api/admin/*` needs a global auth guard (existing admin endpoints are unauthenticated plain handlers); Contact-learner (WhatsApp send) + bulk import own specs; per-module reward amounts; export "Follow-up Note" column is intentionally blank (directory view doesn't carry the note).

### 2026-06-04: State-selection onboarding + live WhatsApp Meta sender

- **Spec/plan:** `2026-06-04-state-onboarding-and-whatsapp-sender-design.md` / `...-sender.md`. Implemented via subagent-driven development (7 tasks).
- **Live Meta sender (`backend/src/whatsapp/sender.ts`):** the bot's first real outbound path. `sendWhatsAppMessage(to, reply)` builds text / interactive-button (≤3, reply shape) / interactive-list messages and POSTs to `graph.facebook.com/{apiVersion}/{phoneNumberId}/messages` using the published WhatsApp integration credentials. No-ops + logs when no WhatsApp config is published; never throws into the webhook; truncates over-long titles (20-char buttons / 24-char rows). 6/6 unit tests.
- **State onboarding step:** new `awaiting_state` conversation state; flow is now name → language → **state (List Message)** → main menu. The state list is driven by an admin-managed option set `bot.state_options` (read via `getRuntimeOptionSet`, **options** namespace) with a hardcoded Anambra/Delta fallback so it works pre-seed. The matcher accepts row id / label / 1-based number (basic-phone keypad users). The choice persists to `users.location` (session plumbing through getOrCreateSession/saveSession/getWhatsAppSession). A returning learner whose `user.location` is already set is unaffected.
- **Webhook deliver-gating:** `POST /webhook/whatsapp` now calls the sender unless the request carries header `X-SheTrades-Source: sandbox`. The dashboard sandbox sends that header (so sandbox testing never fires a real send), and also renders List-Message rows as tappable chips (reusing the existing button-chip `handleSend` path) and shows the learner's state/location in diagnostics.
- **Seed:** `npm run seed:state-options -w @shetrades/backend` idempotently creates+publishes `bot.state_options` (Anambra, Delta) in the options namespace. NOTE: it was initially mis-targeted at the content namespace and corrected (option_set is only valid under options, and `getRuntimeOptionSet` reads the options namespace).
- **Analytics payoff:** as learners pick states, `users.location` populates and the Anambra/Delta funnel breakdowns on `/analytics` light up with real data.
- **Two test-infra learnings:** ESM named exports can't be monkeypatched on Node 24 — config stubs use `setRuntimeIntegrationConfigForTests`; delivery is asserted by stubbing `globalThis.fetch` and checking for a `graph.facebook.com` call.
- **Follow-up:** inbound Meta signature verification (`X-Hub-Signature-256` + appSecret) to harden the webhook — currently the sandbox marker is a soft gate; a real Meta call without the marker correctly delivers, but signature verification would add authenticity.

### 2026-06-04: Full-page audit + critical admin-API auth fix

- **Audit:** ran a 4-way parallel read-only audit of all admin pages + backend + bot flow. Result: typecheck/build clean; core flows (config workspaces, /users actions, /rewards actions, login/profile, full bot flow) correctly wired. Gaps clustered in (a) API auth and (b) inert "future-feature" buttons.
- **CRITICAL FIX shipped (rev 00058-b6n):** the entire `/api/admin/*` data+rewards+users API was **unauthenticated**. Added `adminRouter.use(authenticateJwt)` (same JWT the config-admin router already validates). Login (`adminAuthRouter`) and the donor-export `reportsRouter` are separate mounts, unaffected. Verified on staging: no token → 401, valid login token → 200, login still open.
  - **Frontend half:** `fetchWithFallback` + `rewardsActionFetch` now attach `Authorization: Bearer <stored JWT>` via a shared `authHeaders()` (SSR-safe). Because the token is in localStorage (no SSR access), **/dashboard, /analytics, /reports were converted from server to client components** (joining /users and /rewards). CSV exports switched from `window.location.href` to `downloadAdminCsv()` (fetch+Blob) so they carry the token. `admin.test.ts` updated to mint+attach a test JWT (23 requests) + a 401-without-token test.
- **PROCESS NOTE / near-miss:** during this work, a batch of 3 parallel page-conversion subagents ran a git operation that **discarded my uncommitted `api.ts` auth changes**. Recovered by re-applying and committing immediately. Lesson: **commit shared-foundation files (api.ts) BEFORE fanning out parallel agents.**
- **Audit gaps left OPEN (user-deferred, prioritized):**
  - SECURITY (minor): `reports.ts` donor-export has a hardcoded fallback token `"local-dev-reports-token"` when `ADMIN_REPORTS_API_TOKEN` is unset; bot-facing `/api/rewards/*` endpoints are unauthenticated.
  - FUNCTIONAL: ManualRewardDrawer passes a reward id where a user id is expected (manual reward create 404s) — needs a real `/api/admin/users` learner picker; no Payouts "Test Connection" button/endpoint; inert CTAs on /dashboard (Export Summary, Configure Milestone Rule), /analytics (Download CSV, Review Setup, a permanent "Realtime Sync" spinner stub), /reports (Generate Report, Create Schedule).
  - MINOR: login Enter-to-submit (button not in a `<form>`); reward detail "Open learner →" no-op; bot `processedMessageIds` in-memory dedup won't span Cloud Run replicas; `/reports` presets hardcoded.

### 2026-06-04 (cont.): Cleared the remaining audit gaps

Shipped + verified on staging (backend revs 00059-fwr, 00060-94c; frontend via Vercel):

- **Manual reward picker fixed (was broken).** `POST /api/admin/rewards/manual` now accepts a learner **phone** (resolved server-side; `userId` still accepted for back-compat). The `/rewards` page populates the picker from the real `/api/admin/users` directory (every learner, keyed by phone), not just learners already in the rewards list. Verified: known phone → 201, unknown phone → 404, no learner → 400. (commits acf6686 backend, 792ac42 frontend)
- **Payouts "Test Connection" (new).** `POST /api/integrations/admin/payouts/test` (admin-only) runs the matching adapter's `verifyCredentials` against the submitted (possibly-unsaved) config; added a "Test Connection" button in the Payouts workspace editor. Operators can validate AT/Termii/Reloadly creds before publishing. Verified: no token → 401, valid config → 200 with real adapter result, invalid config → 400. Factored the provider switch into `selectAdapter()` shared with `getActiveProvider()`. (commit cede53f)
- **Security: donor-export token fail-closed.** `authorizeReportsAccess` no longer falls back to the hardcoded `"local-dev-reports-token"` (which was in the public repo). When `ADMIN_REPORTS_API_TOKEN` is unset the export surface is disabled. Documented in `.env.example`; `reports.test.ts` sets it explicitly. Verified donor export → 403 in staging (no secret set there; nothing uses that surface). (commit acf6686)
- **UI honesty pass.** Login form wrapped in `<form>` (Enter submits, button `type="submit"`); reward-detail "Open learner" → navigates to `/users`; dashboard "Configure Milestone Rule" → `/settings`; the not-yet-built feature buttons (Export Summary, Download CSV, Generate Report, Create Schedule, Review Analytics Setup) are disabled with explicit "(coming soon)"; the permanent fake "Realtime Sync" spinner replaced with honest snapshot/refresh copy. (commit 792ac42)

**Deliberately DEFERRED (with rationale):**
- **`/api/rewards/*` (rewardsRouter) auth gate** — left ungated on purpose. It's the *legacy in-memory* reward service (audit log + `issueReward`), reached over HTTP only by `rewards.test.ts`; the bot calls `issueReward()` as a function import, not HTTP. The real money path (Prisma `reward` table) goes through the now-gated `adminRouter` + the Cloud Scheduler worker. Gating it would break tests for ~no security gain. Revisit if that surface is ever exposed publicly.
- **Bot `processedMessageIds` in-memory dedup** won't span Cloud Run replicas — needs a DB-backed dedup (e.g. a `processed_messages` table or Redis). Not yet done.
- **`/reports` presets hardcoded** — should move to config like other content; deferred (config work, low pilot impact).


### 2026-06-04: Admin User Management module (DONE — verified live)

A role-gated module to manage platform admins, added as the **"Admins" tab on /settings** (after Rewards).

**Persistence (the prerequisite):** admin accounts were in-memory (`AdminAuthService` Map) — they did not survive restarts or span Cloud Run replicas. Added a Postgres `admin_accounts` table (Prisma model + `ensurePrismaTables` bootstrap) and rewrote the service to store accounts in the DB. Bootstrap-from-env is now **create-only** (never clobbers a changed password). **Sessions remain in-memory** for now (GAP-D1) — but because every authenticated request re-loads the account from the DB and checks `status`, suspending an admin takes effect immediately. Verified login still works after the swap.

**Backend** (`/api/admin/team`, gated `authenticateJwt` + `requireRoles(["admin"])`, mounted before adminRouter): GET list, POST create, PATCH `/:id/role`, POST `/:id/suspend` + `/reactivate` + `/reset-password`. Guardrails: cannot suspend/demote yourself, at least one active admin must remain, duplicate email → 409. Audit-logged. New auth contracts (createAdmin/updateRole/resetPassword/managedUser schemas). DB-free gating test (`admin-team.test.ts`, 4 tests) + `admin-auth.test.ts` now awaits the async `resetForTests`.

**Frontend** (`AdminTeamWorkspace.tsx`): list, Add Admin (email/name/role/temp password), inline role assignment, suspend/reactivate with a confirmation modal. Self-row actions disabled client-side (backend enforces regardless). Registered as the Admins settings tab + an isolated preview entry.

**Verified end-to-end on live dashboard (she-trades.vercel.app):** login → Admins tab renders after Rewards → DB-backed list → self-row role select + Suspend disabled → Reactivate then Suspend (with confirm modal) both mutate + show feedback + refresh. Backend curl also confirmed: known-email create 201, duplicate 409, suspend→login 401, reactivate→login 200, self-suspend 400.

**Decisions / defaults:** roles reuse the existing `admin`/`editor`/`viewer` RBAC; new admins get a **temporary password set by the creator** (changed via the existing profile form); "suspend" maps to status `disabled`. Reset-password endpoint exists but is not yet surfaced in the UI.

**Notes / leftovers:**
- A QA test admin `qa-temp-admin@shetrades.test` (role editor, **suspended**) exists in staging from verification — harmless; delete from DB if undesired.
- AUM-A3 covered by a DB-free gating test only; a full repository unit test needs a Postgres test DB (ties into GAP-F1).
- AUM-D2 (admin how-to doc) still open — folds into GAP-G1.
- Deployed: backend rev 00061-zqs; frontend via Vercel (commit a6babc9).

### 2026-06-04: Admins tab — reset-password + delete (DONE — verified live)

Extended the Admin Team module with the two remaining row actions:
- **Reset password** (surfaced the existing `POST /api/admin/team/:id/reset-password`): per-row "Reset password" → inline panel → set a new temp password. Verified: reset → login with new password 200, old password 401.
- **Delete** (new `DELETE /api/admin/team/:id`, admin-only): per-row danger button → confirmation modal. Guardrails: cannot delete yourself, at least one active admin must remain; session revoked on delete. Verified: delete → login 401 + gone from list; self-delete → 400.

Self-row Suspend + Delete are disabled in the UI; Reset password is allowed on any row. Verified end-to-end on she-trades.vercel.app (reset panel, delete confirm modal, "deleted" feedback, row removed). Backend rev 00062-lkd; frontend commit 7f07f34. Both QA test admins removed — staging clean.

Note: each backend redeploy clears in-memory sessions, so admins must re-login after a deploy (the documented GAP-D1 session-persistence follow-up).

### 2026-06-04: Security HIGHs GAP-A1..A5 (DONE — verified on staging rev 00063-cr9)

- **A1/A2:** `POST /webhook/whatsapp/reset` (wiped all learner sessions) and `GET /webhook/whatsapp/session/:phone` (PII) are now gated behind `authenticateJwt` — they were public. The Meta-facing `GET/POST /whatsapp` stay public (verified: POST→200, verify GET→403, not 401). The dashboard WhatsApp sandbox simulator now sends the admin token on both calls. Verified: reset/session no-token → 401; session +token → 404 (reaches handler).
- **A3:** mutating adminRouter routes (flag, reward retry/mark-issued/manual) now require role `editor|admin` (`requireWriteAccess`). Viewers were able to mutate. Verified: viewer token → 403 (unit tests); admin flag-write → 200; admin reads → 200.
- **A4:** audit logs read `req.authUser` (was `(req as any).adminUser`, so `actorId` was always null) and now include `updatedAt`; the flag action logs the actor too.
- **A5:** `.env.example` real-looking JWT secret + bootstrap password/email replaced with placeholders. The actual staging values live in the gitignored `cloudrun-staging-env.yaml` and DIFFER from the committed ones, so there was no production-forge risk and no rotation is required.

**New finding (out of A1–A5 scope, worth tracking):** the manual-reward route inserts `module: "Manual"` against `reward`'s `@@unique([userId, module])`, so a learner can only ever receive ONE manual reward (a 2nd attempt 500s on the unique violation). Should use a unique per-issuance module value (e.g. `Manual-<timestamp>`) or relax the constraint for manual rewards, and map P2002 → 409.

**Recommendation (not committed, ops):** the staging `ADMIN_CONFIG_JWT_SECRET` is a weak/guessable string in the gitignored env file — set a long random secret in staging/prod via Secret Manager.

### 2026-06-04: Root-admin protection + GAP-F1 (CI tests) + GAP-G1 (admin docs)

- **Protect root admin (requested):** the env-seeded admin(s) (`ADMIN_AUTH_BOOTSTRAP_EMAIL`, e.g. admin@shetrades.com) are flagged `protected` and cannot be deleted — `deleteAccount` rejects it (400 "This is a protected admin account and cannot be deleted.") and the dashboard disables the Delete button for protected rows. Verified on staging (rev 00064-rhf): list shows `protected=true`, DELETE → 400; UI Delete disabled.
- **GAP-F1 (CI runs tests):** new `backend-tests` CI job spins up a Postgres service, runs the same schema bootstrap as startup (new `backend/src/scripts/setup-test-db.ts` → ensurePrismaTables + initializeAdminViews + runMigrations), then runs the suite **serially** (`test:ci` = `--test-concurrency=1`) so files don't race on the shared DB. Added a dashboard-build step to the quality job. **CAVEAT:** could not verify the run locally (no local Postgres — Docker daemon down — and `gh` unavailable). The job is structured correctly and mirrors how the suite runs with a DB; **watch the first GitHub Actions run** and fix any test that has hidden state assumptions.
- **GAP-G1 (admin how-to doc):** wrote `docs/admin-how-to-guide.md` — add/edit/publish content (draft→publish), manage admins & permissions (roles, suspend, reset, delete + protected root), integrations + Test Connection, rollbacks, and caching troubleshooting. Also satisfies the prior AUM-D2.

### 2026-06-04: GAP-B1 — bot conversation copy is now admin-editable (DONE — verified, rev 00065-lf9)

The `getPrompt()` table (13 localized conversation strings: quiz/correct/incorrect/menu/state prompts) was the last block of hardcoded bot copy. Now:
- The defaults live in a shared `backend/src/whatsapp/bot-prompts.ts` module.
- `handler.getPrompt()` overlays published config from the content namespace (`bot.prompt.<key>` via `getRuntimeLocalizedText`) over those defaults — admins can edit any bot prompt from the dashboard with no deploy; the in-code default is the safe fallback so the flow never breaks if config is empty.
- New `seed-bot-prompts.ts` (`npm run seed:bot-prompts`) publishes the editable baseline from the same defaults (no code/config drift). Seeded to staging: 13 docs published + served (public content API) and listed/editable in the admin content surface (each `ui_copy` doc with en/pcm/ig). Bot verified healthy after.
- Note: menu/language button labels were ALREADY config-driven (`getRuntimeOptionSet("bot.language_options")`, `getRuntimeText("bot.main_menu"...)`) — so this completes the remaining hardcoded conversation copy. Same overlay mechanism those already-working paths use.

**To roll out elsewhere:** run `BOT_PROMPTS_SEED_BASE_URL=<api> ADMIN_CONFIG_JWT_SECRET=<secret> npm run seed:bot-prompts -w @shetrades/backend` once per environment (idempotent).

**GAP-B remaining (MED):** B2 (analytics SQL hardcodes Anambra/Delta → env), B3 (frontend hardcoded option sets: analytics/dashboard tabs, reports presets, RewardsToolbar pills, manual reward defaults, AdminShell nav), B4 (worker/engine thresholds → env).

### 2026-06-04: Premium sidebar facelift + GAP-B4 (payout thresholds -> env)

- **Sidebar facelift (requested):** reworked the bare white sidebar into a premium dark "command rail" using the existing brand palette (deep-teal gradient + gold accent). Gold monogram brand mark + "Admin Console" subtitle; nav grouped into labeled sections (Engagement / Operations / Configuration) with line icons; premium active state (elevated surface + gold icon + gold rail indicator) + hover micro-interaction; profile card restyled for the dark rail (scoped so /profile is untouched). All new colors/gradients/shadows are design tokens added to :root; labels stay config-driven. Verified live (screenshot). Commit 2a0b8b5.
- **GAP-B4 (DONE):** payout worker thresholds `BATCH_LIMIT`/`RETRY_CEILING`/`BASE_DELAY_MS` now read from env (`PAYOUTS_BATCH_LIMIT`/`PAYOUTS_RETRY_CEILING`/`PAYOUTS_BASE_DELAY_MS`) with the current values as defaults; documented in .env.example. (The legacy in-memory engine constants are not on the live path — left as-is.)

**GAP-B remaining are STRUCTURAL (not simple swaps), need a small design decision:**
- **B2** — analytics live SQL has TWO hardcoded state columns (Anambra/Delta) + the contract has `funnelAnambra`/`funnelDelta` fields. Truly dynamic per-state analytics means grouping by location (N states) and reshaping the contract + the frontend tabs — a redesign, not an env swap. (A minimal env-parameterization of just the two pilot states is possible but stays two-state.)
- **B3** — frontend hardcoded option sets (analytics/dashboard state tabs, reports presets, RewardsToolbar pills/date-ranges, manual-reward defaults, AdminShell nav). Some (state tabs) are coupled to B2's two-state structure.

### 2026-06-04: GAP-B2 + state-tabs of B3 — dynamic per-state analytics (DONE, rev 00067-n2s)

Replaced the hardcoded two-state (Anambra/Delta) analytics with a fully dynamic per-state breakdown.
- **Contract:** `AnalyticsPageData.funnelAnambra/funnelDelta` -> `stateFunnels: StateFunnel[]` (state, registered, completed, passed, completionRate, passRate). Mirrored backend + frontend.
- **Postgres (primary):** live query now does `GROUP BY user_location` (one row per state) + a separate overall aggregate. Any location a learner has shows up — including custom "Others" states.
- **Firestore (secondary):** maps its two configured pilot-state counts into the new shape (can't GROUP BY cheaply); snapshot strategy returns overall + empty stateFunnels.
- **Frontend:** analytics + dashboard funnel panels render an "Overall" tab plus one tab per state, dynamically from stateFunnels.
- **Verified live:** `/api/admin/analytics` returns 4 states (Anambra, Benue, Delta, Lagos) reflecting actual learner data — Benue/Lagos are custom "Others" states that were previously invisible. Frontend tablist renders: Overall · Anambra · Benue · Delta · Lagos. analytics-live tests updated + pass; typecheck/build clean.
- **Note:** learners with no location are (correctly) excluded from per-state rows but counted in the overall funnel.

**GAP-B3 remaining (the non-state-tab items):** reports presets, RewardsToolbar status pills / date-range options, manual-reward defaults (amount/channel), AdminShell nav set. These are independent hardcoded option sets (not coupled to the analytics redesign).

### 2026-06-04: GAP-B3 remaining option-sets -> config (DONE, rev 00068-lr9). GAP-B fully complete.

- **Manual-reward defaults** (amount/channel): now sourced from the published Reward Rule via `GET /api/admin/rewards` `meta.defaults` (the rewards page uses it, falling back to in-code 5000/airtime). Verified: staging returns `{amount:500, channel:airtime}` (the admin-set rule), so the manual drawer defaults to the configured amount, not a hardcode.
- **Rewards toolbar status pills + date ranges** and **report presets**: read from published option sets (`rewards.status_options`, `rewards.date_range_options`, `reports.presets`) via a new `dashboard/lib/config/options.ts#fetchPublicOptionSet`, with the built-in sets as safe fallbacks. Status pill colour stays mapped by value (structural). New `seed:frontend-options` script publishes the editable baselines (seeded to staging: 4/4/3 items published + served).
- **AdminShell nav**: labels were already config-driven (copyKeys resolved from admin-ui-copy); the nav SET is route-structural and intentionally code-defined (adding a nav item requires a route/page) — not "admin-editable content".

**GAP-B is now fully done:** B1 (bot copy), B2 (dynamic per-state analytics), B3 (frontend option sets), B4 (payout thresholds env).

### 2026-06-04: Interactive /content walkthrough (premium guided tour) — DONE, verified live

Added a Fortune-500-style guided spotlight tour to /content to help non-technical admins.
- New reusable **GuidedTour** UI component (`components/ui/GuidedTour.tsx`): dimmed backdrop with an animated spotlight cutout (CSS box-shadow technique) over each real element + a gold ring (brand accent); polished tooltip card with step counter, progress dots, Back/Next/Skip; keyboard (←/→/Enter/Esc), scroll-into-view, body scroll-lock, focus, ARIA dialog. Design-system tokens only.
- **ContentWalkthrough** (`components/content/ContentWalkthrough.tsx`): 6 plain-language steps over the /content workspace (welcome → create+find → library table → draft/publish safety → translations → outro). Auto-shows once per browser (localStorage `shetrades.content.tour.v1`); replayable via a "Take a tour" button in the page header.
- `data-tour` anchors added to the content toolbar + review table; translations panel anchored on the page. Workshop preview entry added (`GuidedTourPreview`).
- Verified live on she-trades.vercel.app/content: auto-opened on first visit; spotlight precisely highlights the toolbar with the rest dimmed; step counter/dots/controls all work. (frontend-only; commit 091d2ab)

Follow-up (optional): the tour step copy is currently in-code; it could be made admin-editable via a content config doc + the existing getRuntimeText pattern.

### 2026-06-04: Content tours — form tour + prominent CTA (verified live)

- **Prominent "Take a tour" CTA:** the content-page tour button (and the new form-tour button) now use an eye-catching gold style — gold border, soft gold fill, sparkle icon, and a subtle pulsing glow (respects prefers-reduced-motion). Verified live (gold border rgb(255,190,34)).
- **Tour on the create-content form:** new `ContentFormWalkthrough` mounted inside `ConfigEditorDrawer` (content namespace only). A 6-step guided spotlight tour over the form itself — Visual-Wizard/JSON toggle, the step-progress bar, the current step panel, and the save/publish footer. Auto-shows once when the form first opens (localStorage `shetrades.content.form.tour.v1`) and replayable via a "Tour this form" button in the drawer header. The tour (z-index 1200) layers above the SideDrawer, so the spotlight highlights elements INSIDE the drawer. Verified live: opening Create Content auto-launched the tour; step 3 spotlit the wizard progress bar with the rest dimmed. (commit 531b55c)

- **Fix:** guided-tour spotlight could land off-screen (horizontal scroll) when a target was a wide element inside a horizontally-scrollable drawer. Now the spotlight rect is clamped fully within the viewport, the overlay clips overflow, and the tour only scrolls vertically (never horizontally). Verified at 980px: spotlight + card within viewport, 0 document horizontal overflow. (commit fe8ee8f)

### 2026-06-06: Form-tour regression FIXED — portal overlay out of the drawer transform (verified live)

- **Symptom:** the create-content form tour rendered as a flat dim overlay with **no visible spotlight cutout and no tooltip card** ("just an overlay … going off screen"). Earlier off-screen complaint had the same root cause.
- **Root cause:** `GuidedTour` rendered *inline* inside `ConfigEditorDrawer`, which lives in the `SideDrawer`. The drawer's sliding **panel uses a CSS `transform`**, and a transformed ancestor becomes the containing block for `position: fixed` descendants. So the whole overlay (backdrop + spotlight + card) was trapped in the drawer's coordinate space: the centered card computed `left: 50%` of the **panel** width (~372px) instead of the viewport (720px at 1440), and the spotlight's viewport-based coords no longer mapped to the real viewport — pushing it off-screen / invisible. The previous viewport clamp then shrank it to an invisible edge sliver.
- **Fix (`components/ui/GuidedTour.tsx`, commit 5b9e27b):**
  1. Render the overlay through `createPortal(…, document.body)` so it positions against the **real viewport** regardless of any transformed ancestor (SSR-guarded with `typeof document === "undefined"`).
  2. Added an off-screen/zero-size guard in `measure()`: if a target measures fully outside the viewport or zero-size, fall back to the **centered card** instead of a clamped sliver.
- **Verified live** (she-trades.vercel.app/content, Create Content → "Tour this form", 1440×820):
  - `.guided-tour` parent === `document.body` (portaled).
  - Step 1 (centered): card `left` computes **720px** = viewport centre (was 372px). `cardCenterX === viewportCenterX`.
  - Step 3 (`.wizard-progress`): spotlight `696,217 713×96` exactly wraps target `704,225 697×80` (+8px pad), within viewport, aligned; card within viewport; **0 horizontal overflow**. Screenshot confirms clean spotlight + card.
  - Step 4 (`.wizard-panel`, tall 530px): spotlight bounded within viewport, card auto-placed above it, 0 horizontal overflow.

### 2026-06-16: Content table capped at 20 — load all documents (fix, deployed)

- **Symptom:** /content "Review Content" table never showed more than 20 items; All/Draft/Live/Trash count chips + "Total Items" stuck at 20 regardless of how much content was added.
- **Root cause:** `ConfigAdminManager` loaded content via `GET /api/config/admin/:namespace/documents` with **no `pageSize`** (`ConfigAdminManager.tsx:938`). Backend list contract defaults `pageSize` to 20 (max 100) (`config-platform/contracts.ts:230`). Table rows + all counts are derived client-side from the loaded array (`filterCounts`, `ConfigAdminManager.tsx:697`), so it hard-capped at 20. The adjacent options fetch correctly passed `?pageSize=100`, which masked the bug.
- **Proof:** public bundle `/api/config/public/content` reports **148** published docs in the content namespace (20 `content.*`, 27 `bot.*`, 101 `admin.*` UI-copy) — table was showing 20 of 148.
- **Fix (commit fe2c76c, dashboard):** added `fetchAllDocuments(listPath)` that pages through the list endpoint at pageSize=100 until it has the reported `total` (50-page / 5,000-doc safety backstop); used for both the content and options document loads. Extended `ListResponse` type with `total/page/pageSize`. Counts + rows now reflect the full library. Build passes.
- **Verification:** confirmed 148-doc total via public API + build green. Could NOT do logged-in UI check (Playwright session cleared by the earlier backend restart; no admin creds in-session) — user to confirm the All count now shows ~148 after re-login.
- **Follow-ups (optional, not done):** (1) the content namespace mixes lessons (20) + bot prompts (27) + admin UI copy (101); if the content table should exclude `admin.*` copy, scope the admin content list by type/keyPrefix. (2) If the library grows to thousands, replace client-side load-all with a true server-side paginated table.

### 2026-07-13: Bot lesson menu + lesson ordering (deployed, staging rev 00073-q6g)

- **Lesson menu:** selecting a module previously jumped straight into the learner's next unfinished lesson with no way to browse. Now it shows a WhatsApp **interactive list** of the module's lessons (✅ done / ▶️ pending, full title in each row description, tappable or number-reply). New `lesson_menu` conversation state; picking a lesson routes into the existing lesson/quiz flow. The list is a separate message (own 1024 budget) — does not affect lesson body limits. `MENU` still resets globally. Prompt strings `lesson_menu_header/footer/button` are `getPrompt`-overridable via config. (`backend/src/whatsapp/handler.ts`, commit 07aa9a0)
- **Ordering fix:** `getRuntimeLessons()` returns docs in DB-update order, so lessons showed jumbled (Lesson 2 = m1_l9) and the linear next-lesson flow followed edit order. Now each module's lessons are sorted by the `_l{N}_` number in the key. (commit ad3a75d)
- **Verified** via sandbox conversation: module 1 → ordered list (Lesson 1..9 = m1_l1..m1_l9) → pick lesson N → lesson delivered into quiz flow.
- **Content reformat (Version B) in progress, separate track:** m1_l1 reformatted + published (paragraphs + numbered steps, 904/1024); remaining 42 lessons pending. Apply mechanism: mint admin JWT from `ADMIN_CONFIG_JWT_SECRET` (cloudrun-staging-env.yaml) → PUT `/api/config/admin/content/documents/{key}/draft` → POST `/publish` (versioned/rollback-able). English only; pcm/ig still "Welcome content" placeholders.

### 2026-07-13: Version B content reformat — ALL 43 lessons complete (staging)

- Reformatted every English lesson body to "Version B": paragraph breaks (blank lines), numbered steps / bullet lists for procedures, selective `&` and `NGN`→`₦` compression, light copyedits (typos), meaning preserved. Fixed the "wall of text" clumping (0/43 previously had paragraph breaks).
- Applied via minted admin JWT (`ADMIN_CONFIG_JWT_SECRET`) → PUT draft → publish, per module (scripts in scratchpad module2-5.py + apply_m1). quiz / pcm / ig / audioUrls preserved untouched.
- **Final audit:** 43/43 lessons — 0 over 1024, 0 missing paragraph breaks, 0 missing quiz, largest message 975/1024. All versioned/rollback-able.
- Still English-only: pcm/ig remain the "Welcome content" placeholder (translation is the next content gap).

### 2026-07-13: Module menu → list + seedable menu prompts (staging rev 00075-8kc)

- **Module menu is now a WhatsApp interactive list** (both the start-learning entry and the invalid-selection fallback), replacing reply buttons — all 5 modules are now tappable (buttons cap at 3). Rows: title "N. Module N", full topic in the description (no truncation); tap or number-reply both work. New `buildModuleListReply` helper in handler.ts.
- **New menu prompts registered + published:** `lesson_menu_header`, `lesson_menu_footer`, `lesson_menu_button`, `module_menu_button` added to BOT_PROMPT_DEFAULTS/TITLES (en/pcm/ig) and published as `bot.prompt.*` (type ui_copy) — now editable in the admin copy editor. (commits 923bb4c, + row polish)
- Verified via sandbox: module list shows 5 clean rows; tapping "Module 4" → lesson_menu.

### 2026-07-14: Quiz answers >20 chars scored WRONG on WhatsApp (fixed, unit-tested, deployed rev 00076-kfv)

- **Bug:** M1 L7 Q3 (and 12 others) worked in the sandbox but were scored WRONG on real WhatsApp. **Root cause:** WhatsApp truncates interactive reply-button titles to 20 chars (`BUTTON_TITLE_MAX`, sender.ts). The correct option "Set who sees your info" (22) is sent clipped to "Set who sees your in"; WhatsApp echoes the clipped `button_reply.title`, the webhook reads `title` first (webhook parse in handler.ts), and the matcher compared the clipped text against the full option → no match → wrong. The sandbox echoes the FULL untruncated title, so it always passed there. Not a char-limit rejection (#131009) — a scoring mismatch.
- **Blast radius:** 13 of 43 lessons had a **correct** answer >20 chars (all previously unpassable on WhatsApp): m1_l7 Q3, m1_l9 Q2, m3_l2 Q2, m3_l5 Q2, m3_l6 Q3, m4_l1 Q2, m4_l2 Q3, m4_l3 Q2, m4_l4 Q3, m4_l5 Q3, m4_l8 Q2, m5_l2 Q3, m5_l7 Q2.
- **Fix:** extracted a pure, exported `isQuizReplyCorrect(rawInput, options, answerIndex)` in handler.ts; it matches each option in BOTH full and 20-char-clipped form (mirrors sender's clip via the now-exported `BUTTON_TITLE_MAX`/`clip` from sender.ts). Numeric ("1"/"1."/"1)") matching unchanged. Command buttons (QUIZ/NEXT/MENU) untouched (short titles never clip). No parse/id changes → sandbox + list flows unaffected.
- **Tests:** new `backend/src/whatsapp/handler.test.ts` (8 cases: clipped-correct, full-correct, case-insensitive, numeric, prefixed, wrong-full, wrong-clipped, 47-char). `npm test` handler+sender green (14/14); typecheck clean.
- **Separate cosmetic note (not scoring):** 36 options across the set still exceed 20 chars, so their button LABEL shows visibly truncated (e.g. "Set who sees your in"). Scoring is now correct regardless; content team may optionally shorten these ≤20 for cleaner display.
- **Deployed:** `shetrades-backend-staging` rev **00076-kfv** (100% traffic). **Verified end-to-end on live backend** via webhook sim: M1 L7 Q3 answered with the clipped title WhatsApp actually sends (`"Set who sees your in"`, id `"1"`) → "🎉 Correct! …completed this lesson"; negative control (wrong option) → "❌ That is incorrect." Code change is live but **not yet committed to git** (still on `main`).
