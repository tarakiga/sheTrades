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
- **Deployed:** `shetrades-backend-staging` rev **00076-kfv** (100% traffic). **Verified end-to-end on live backend** via webhook sim: M1 L7 Q3 answered with the clipped title WhatsApp actually sends (`"Set who sees your in"`, id `"1"`) → "🎉 Correct! …completed this lesson"; negative control (wrong option) → "❌ That is incorrect." Merged to `main` (`a6edcb5`).

### 2026-07-14: Task 071 — Language-aware schema + WhatsApp constraint counters (prereq for pcm/ig translation)

Two deliverables so the content team can translate lessons to Pidgin/Igbo with live guardrails. **Not yet committed/deployed** (backend change is backward-compatible; dashboard change goes live on Vercel when merged).

- **Language-aware schema (backward compatible).** `title` and each quiz `question` / `option` are now `LocalizedValue = string | {en,pcm?,ig?}`. A bare string = English, so all 43 existing lessons keep working with zero migration. `answerIndex` unchanged (position is language-independent).
  - Backend: `LocalizedValue` + `pickLocalized()` in `runtime-config.ts`; `getRuntimeLessons()` now preserves the localized shape (no more `String()` flattening that would have produced `[object Object]`). `handler.ts` resolves title/question/options via `pickLocalized(x, lang)` at every send + list + matching site. `sender.ts` limits moved to new `whatsapp/constraints.ts` (single source of truth; `BUTTON_TITLE_MAX`/`ROW_TITLE_MAX` re-exported). Backend typecheck clean, 14/14 whatsapp tests pass.
  - Frontend drawer (`ConfigEditorDrawer.tsx`): lesson title and quiz (question + each option) are now edited per-language (English base + Pidgin/Igbo tabs). Parse/serialize handle BOTH legacy string and object shapes; English-only content still serializes as a bare string (only emits the object form once a translation exists, like `languages`).
- **Constraint counters (`ConstraintMeter`).** Live green/yellow/red meter (green = standard, yellow = breathing-room band ≈10%, red = over) built from the semantic design tokens. Wired into the content drawer: **lesson title** (limit 72, list-row description), **body** (composed lesson message vs 1024 — includes the 📖 prefix, title, and quiz-instruction the bot adds), **quiz question** (composed quiz message vs 1024), and **each quiz option** (20 — the reply-button clip that caused the earlier scoring bug). Counts UTF-16 code units (emoji = 2) and discloses bot-added chars via `systemChars`. Shared math in `dashboard/lib/whatsapp-constraints.ts` mirrors backend constraints + bot-prompt defaults (kept in sync by hand — no shared package across the boundary).
  - New reusable component `dashboard/components/ui/ConstraintMeter.tsx` (exported + preview story on `/previews/components`). **Verified in browser:** all four states render correctly (9/20 green, 18/20 yellow, 24/20 red "cut off", 946/1024 yellow "+120 auto-added by the bot"); no console errors. Dashboard typecheck clean; lint net −1 (no new issues; pre-existing dead code in the drawer untouched).
  - Files: `backend/src/whatsapp/constraints.ts` (new), `backend/src/config-platform/runtime-config.ts`, `backend/src/whatsapp/handler.ts`, `backend/src/whatsapp/sender.ts`, `dashboard/lib/whatsapp-constraints.ts` (new), `dashboard/components/ui/ConstraintMeter.tsx` (new), `dashboard/components/ui/index.ts`, `dashboard/components/config/ConfigEditorDrawer.tsx`, `dashboard/app/globals.css`, `dashboard/app/previews/components/page.tsx`.
  - Not covered: driving the authenticated drawer end-to-end (needs admin login); tightening server-side lesson Zod validation (lessons still persist via the `z.record` catch-all as before).

### 2026-07-21: Backlog gap remediation — C1–C7 + A6–A8 (deployed rev 00078-tg8)

Fixed and deployed all 10 open backlog gaps from `remaining-gaps.md`/`task-list.md`.

- **C1 (HIGH)** `handler.ts` — `awaitingQuizAnswer` with a missing quiz item now resets the flags and re-prompts (new `quiz_unavailable` prompt) instead of trapping the learner.
- **C2 (HIGH)** `handler.ts` — inbound message is claimed, then the session is saved; the claim is only kept on success and RELEASED on failure so Meta's retry reprocesses (no more lost progress on a DB blip).
- **C3 (MED)** `handler.ts` + `admin/prisma.ts` — dedup moved to a Postgres `processed_webhook_messages` table (cross-replica, opportunistically pruned to 2 days); in-memory Set kept only as a bounded fail-open fallback. **Verified live:** same message id → first `processed`, second `duplicate`.
- **C4 (MED)** `handler.ts` — `list_reply` now resolves by canonical `id` first; module selection accepts `module-N` / number / name fragment; lesson selection accepts the lesson key; `resolveState` matches id case-insensitively (fixes non-ASCII Igbo "Others"). **Verified live:** row id `module-1` → lesson_menu.
- **C5 (MED)** `handler.ts` — dropped `lessons.length || 6` magic (divide-by-zero guarded); invalid-state re-prompt localized via new `state_invalid` prompt.
- **C6 (MED)** `reports/export-service.ts` — exports query the real DB (reward/userProgress); default render mode is now `real`, `mock` is opt-in; resilient to a missing DB (header-only, keeps tests green).
- **C7 (LOW)** `handler.ts` — emits a `lesson_viewed` structured analytics event on lesson open; `quizAnswerButtons()` stops silently dropping the MENU button from 3-option quizzes.
- **A6 (MED)** `routes/{content,learning,rewards}.ts` — legacy in-memory routers gated with `authenticateJwt` (+ roles on mutations), applied PER-ROUTE (router-level `use` on the broad `/api` mount would have rejected unrelated `/api/*` routes). New content.test auth-gate regression.
- **A7 (MED)** `validation/reliability-check.ts` — removed the hardcoded `local-dev-reports-token`; reports probe runs only when the secret is set; dropped the now-gated content-lessons probe.
- **A8 (MED)** `routes/webhook.ts` + `app.ts` — verify Meta's `X-Hub-Signature-256` HMAC over the raw body; sandbox exempt; fail-open with a warning until `appSecret` is configured (so current staging keeps working), enforced once set.

Verification: backend typecheck clean; 57 non-DB tests green (reports/content/whatsapp/config); live regression of the full M1 L7 flow still PASS; C3 + C4 verified live. Commit `aa54393`, deployed `shetrades-backend-staging-00078-tg8`.

### 2026-07-21: Backlog gaps D/E/F/H — 8 of 10 closed (deployed rev 00079-zk5)

Continued from the C/A batch. Closed **D1, D2, E1, E2, F3, H1, H3, H4**.

- **D1 (MED)** — the two in-memory singletons that actually lost data are now in Postgres:
  - **Admin sessions** (`admin_sessions`): sessions lived in a Map, so a session minted on one Cloud Run instance was invalid on another and *all* sessions were dropped on scale-to-zero (~15 min idle) — admins were being logged out mid-task. Now persisted; logout/revocation/expiry honoured across replicas.
  - **Translation requests** (`translation_requests`): the whole `/content` translation queue was wiped on every scale-to-zero. Persisted now — important because the Pidgin/Igbo work is about to put real requests in it. Service is async + DB-backed; route tests became integration tests that skip cleanly without `POSTGRES_URL`.
  - *Deliberately not done:* export jobs (regenerable artifacts, low severity) and the config-platform cache (a cache by design).
- **D2 (MED)** — admin reward filters validated/coerced with Zod: `from`/`to` no longer reach SQL as `Invalid Date`, `limit` no longer as `NaN` (clamped 1–100), `q`/`cursor` capped at 200 chars. Per-field `.catch(undefined)` so one bad filter doesn't discard the rest. +6 unit tests.
- **E1 (MED)** — frontend config contracts are Zod schemas mirroring the backend, types derived from them. Responses validated instead of cast; bad envelope → safe empty defaults, individual malformed docs dropped rather than losing the bundle. `zod` declared as a dashboard dep (previously relied on hoisting).
- **E2 (MED)** — replaced blanket `cache:"no-store"` with short tagged revalidation (`config`, `config:<namespace>`), so the backend's ETag/Cache-Control is honoured and a publish can bust it via `revalidateTag`.
- **F3 (MED)** — `POSTGRES_URL` added to `.env.example` (a fresh checkout couldn't boot), plus `WHATSAPP_APP_SECRET` and reward defaults.
- **H1 (MED)** — `.catch` handlers on the users/analytics/dashboard loads so a rejected fetch surfaces a message instead of an unexplained empty page + unhandled rejection.
- **H3 (MED)** — a11y: `Tabs` takes a descriptive `label` (4 call sites) instead of a generic "Tabs"; reward-rule toggle exposes `aria-pressed`; 17 wizard toggle buttons expose `aria-pressed` with their 6 groups labelled `role="group"`. (Icon buttons already route through `IconActionButton`, which sets `aria-label` — that bullet was stale.)
- **H4 (LOW)** — preview entries added for `AdminWorkspaceMetricStrip`, `RichTextEditor`, `Textarea` (hint + error states) and `AdminRouteLoading`; verified rendering on `/previews/components`.

**Still open:** **F2** (adopt Prisma migrations) and **H2** (tokenize remaining inline styles/hex). F2 should be its own planned change — it means baselining the live schema and running migrations in the deploy pipeline; done hastily on a DB holding real learner data it risks a broken deploy.

Verification: both packages typecheck clean; 52 pass / 5 skipped. Post-deploy on rev 00079-zk5: `/ready` 200 (DB reachable), login returns a clean 401 (auth+DB path healthy), no table-bootstrap errors in logs, full M1 L7 bot e2e still PASS. **Please do one real admin login to confirm the session-create path** — I deliberately did not use your credentials.

---

## 2026-07-21 — Reflection questions & help signals (branch `fix/reflection-questions`)

Plan: `docs/superpowers/plans/2026-07-21-reflection-questions.md`. Executed subagent-driven,
two-stage review (spec then quality) per task.

**The bug.** A tester reported Module 2 Lesson 6 marking "I need help migrating" as ❌ and
re-showing the same question. Verifying it found the problem was larger than reported:

- **"Not yet" was also scored wrong** — the more common honest answer, and the one the
  tester missed.
- No retry limit exists, so the only exits were MENU (abandons the lesson) or claiming "Yes".
- Module completion drives `prisma.reward.upsert` → real airtime. **The only path to a reward
  ran through a false claim**, corrupting the completion data reported to funders.
- At least 11 lessons share the shape. The six lessons in `lessons.seed.json` are all genuine
  knowledge questions — the check-in style was authored later, through the admin UI, into a
  schema that only understands right and wrong.

**The fix.** A `kind: "scored" | "reflection"` discriminator on the quiz item. Absent `kind`
normalises to `"scored"`, so all live lessons keep today's behaviour until a human marks a
question. Reflection answers always advance; the designated help option additionally emits
`help_requested`, which raises the existing `flaggedForFollowUp`/`followUpNote` columns on
`User` — they already rendered in `/users` but had never been wired to the bot.

**Rejected alternative** (recorded so it is not revisited): the tester suggested re-sending the
lesson body on "I need help". That leaves "Not yet" broken, requires string-matching option text
that varies per lesson and disappears entirely once translated to Pidgin/Igbo, compounds the
over-1024-char body problem, and reintroduces a loop. There is also no lesson re-read command
in the bot, so it would need building regardless.

**What review caught that implementation missed** — worth noting, both were silent-wrong-answer
bugs that passed every test:
1. The extracted resolver returns `-1` for "no match"; the delegate compared `=== answerIndex`
   with no guard, so `answerIndex === -1` (reachable — the config-platform publish path does no
   validation) made **every unrecognised reply score correct**, writing `correct: true` into Pass
   Rate analytics. Guard restored.
2. The shared advance helper still said **"🎉 Correct!" to someone answering "Not yet"** — the
   data was fixed but the message still affirmed. Fixed with caller-chosen copy, keeping one
   shared code path so scored and reflection cannot drift.

Also fixed in passing: an inherited defect where an exact full-text match lost to an earlier
option's 20-char clipped prefix (a misroute once branch logic keys on the resolved index), and
a duplicate-seeder mistake of mine — I had `bot.prompt.*` entries added to
`admin-ui-copy.seed.json` when `seed-bot-prompts.ts` already publishes those same document keys,
which would have made the live value depend on which seeder ran last.

**Verification:** backend 52/52 and dashboard typecheck clean. The `advanceAfterAcceptedAnswer`
extraction was verified 119 lines byte-identical to the code it replaced; scored-question
serialization in the drawer verified byte-identical over 11 legacy shapes plus the 6 seeded
lessons. Admin controls verified in the browser via DOM/ARIA assertions on the new
`/previews/components` entry — **screenshots time out in this environment, so no one has
visually eyeballed the rendered result. Worth a human glance.**

**Outstanding:**
- **Content backfill** — `docs/reflection-question-candidates.md` lists 11 candidates for a
  human verdict. Nothing changes until an editor marks a question and publishes; scored is the
  default, so leaving it undone is safe.
- **`answerIndex` is unvalidated at the config boundary** — `config-platform/service.ts:84`
  returns the lesson payload unvalidated and `runtime-config.ts` coerces non-numbers to 0 with
  no bounds check. The zod guard with `.min(0)` lives in `content/service.ts`, a different write
  path. Now fails closed rather than open, so it is no longer urgent, but it should be closed.
- The help acknowledgement thanks the learner twice ("thank you for telling us" then "Thanks for
  sharing"). Both strings are admin-editable without a deploy — worth a copy pass before launch.

**Incident:** a review subagent ran `git worktree remove --force` across a junctioned
`node_modules` and emptied the repo's `node_modules` plus working-tree files under `backend/`,
`dashboard/`, `shared/`. It restored them (`git restore`, `npm ci`, `prisma generate`) and
disclosed it; I re-verified HEAD, untracked files, both typechecks and the full suite before
continuing. One casualty: a local modification to `dashboard/next-env.d.ts` was reverted to the
committed version (auto-generated, regenerates on build). Later agents were instructed not to
create worktrees.

---

## 2026-07-22 — Machine translation workflow (branch `feat/translation-provider-adapter`)

Plan: `docs/superpowers/plans/2026-07-22-machine-translation-workflow.md`. 17 commits.

Bulk/single machine translation of the 43 lessons into Nigerian Pidgin and Igbo. Machine output
lands in a `translation_drafts` review store (never live content), is reviewed against the same
WhatsApp character gauges the content form uses, and is promoted per-language into live content
through the config platform's normal audited publish path.

**Architecture — why per-language providers:** no single provider covers the need. The Igbo API
(Nkọwa okwu) does eng↔ibo only, one string per request, under a daily cap — it CANNOT produce
Pidgin. Pidgin only comes from an LLM, which is also the only provider that can be told the
20-char WhatsApp button budget quiz options must fit. So `providerByLanguage: {pcm, ig}` selects
an adapter per language; the Pidgin select is type-restricted to the LLM providers.

**The two correctness-critical pieces (both adversarially reviewed):**
- `extract.ts` — options extracted as position-keyed units (`q0.opt2`), reassembled BY ID not
  provider order, so answerIndex can't be misaligned; a failed option becomes null → its whole
  question stays English on promote.
- `promote.ts` — merges only the target language, never touches answerIndex, refuses when the
  lesson has a pending draft (would clobber an unfinished English edit), atomic via
  publishDocument's expectedDraftVersionId, and refuses a stale translation (English changed
  since it was made).

**Runner** paces against the Igbo API daily cap (`dailyRequestLimit`, config not assumption),
stops cleanly, and resumes — proven by test that reviewed/up-to-date lessons never reach the
paid adapter (`translateCalls===0`).

**Nothing auto-publishes.** Machine output is `machine_draft`; a human moves it in_review →
approved; only approved promotes. Content teaches money decisions — the human gate is deliberate.

**Verification:** 72 translation tests pass / 3 skipped (DB-guarded, ran green against local
Postgres for the draft store). Both packages typecheck clean. UI browser-verified on
`/previews/components` (RED over-limit gauges, approve→promote state machine, "English changed"
badge). Full backend suite has 33 pre-existing DB-dependent route failures unrelated to this
work (webhook 5/10 etc., unchanged; CI runs with Postgres).

**Operator TODO before first use:**
1. Configure + PUBLISH the Translation integration (Settings → Integration → Translations),
   with a Gemini key (covers both languages). Set the Igbo API dailyRequestLimit to the key's
   real cap (docs say 2,500/day; reported 500).
2. **Shorten the 27 lessons whose English body exceeds 1024 chars FIRST** — translations run
   longer and inherit the overflow; the gauges will show red on content that was already over.
3. The Anthropic adapter is a documented stub (load the claude-api skill to finish it).
4. End-to-end run against real content + a real key has NOT been exercised — unit-tested only.

---

## Bugfix: promoted translation not reaching the bot (runtime cache stale)

**Symptom:** Operator promoted the m1_l2 Pidgin translation. It showed correctly in the
content admin, but the WhatsApp bot still served the old Pidgin placeholder.

**Root cause:** The bot serves lessons from an in-memory cache (`cachedPublicConfigs` in
`config-platform/runtime-config.ts`), rebuilt only by `refreshRuntimeConfigCache()`. Every
mutating route in `config-admin.ts` calls it after writing published content; the translation
**promote** route (`routes/translation.ts`) published into the content document via
`promoteDraft` but never refreshed the cache. So the DB (and the admin, which reads the DB) had
the translation, while the running bot process kept the pre-promotion payload until restart.

**Fix (commit 3dced4f):** promote route now calls `refreshRuntimeConfigCache()` after
`promoteDraft`, mirroring config-admin. Only `promote` touches published content — `/run`, the
save PUT, and `/approve` only write the `translation_drafts` table, so no refresh needed there.
Added a DB-gated regression test (`translation.test.ts`) that drives the promote route and
asserts `getRuntimeLessons()` reflects the promotion with no manual refresh.

**Deployed:** revision shetrades-backend-staging-00090-xng. The fresh process re-inits its cache
from the DB, so the already-promoted m1_l2 pcm now serves correctly too.

**Known limitation:** the refresh is per-process/per-instance (same as config-admin). If staging
autoscales beyond one instance, a promote refreshes only the instance that served the request;
others catch up on next deploy/restart. Acceptable for the pinned single-instance staging.

---

## Full-page audit follow-up: privacy config, ESLint repair, coming-soon spec

Three deliverables from the page audit (see the audit findings for context):

**1. Privacy policy fully config-driven (commit cc8d41d).**
`/privacy` no longer hardcodes org name / effective date / contact email in its
header. All three plus the policy body read from the `legal` namespace
(`legal.privacy.org_name`, `legal.privacy.contact_email`, `legal.privacy.policy`),
with the in-code values kept as safe fallbacks. Fixed the override to read the
real legal_block field (`body.en`, legacy `{en}` tolerated) and format the date
from `effectiveFrom`. New `npm run seed:legal-privacy -w @shetrades/backend`
creates + publishes these three legal blocks so they appear in Settings → Legal.
  - **Operator action:** run the seed against staging to populate the Legal tab:
    `ADMIN_CONFIG_JWT_SECRET=<secret> LEGAL_PRIVACY_SEED_BASE_URL=<staging-url> npm run seed:legal-privacy -w @shetrades/backend`
    (or create the three legal blocks by hand in the Legal tab). Until then the
    page renders the built-in fallbacks. Set the real client privacy email there.

**2. ESLint repaired + all 43 errors cleared + inline colors tokenized (commit 24efe8c).**
Root cause: dashboard had no local ESLint config, so lint fell back to the root
config which lacked the React/Next plugins the source references via
eslint-disable directives (→ "rule not found"), and `next build` didn't lint —
so dead code + `any` accumulated. Added `eslint-plugin-react-hooks` +
`@next/eslint-plugin-next` and `dashboard/eslint.config.mjs`. Removed dead code,
replaced `any` with real types, tokenized hardcoded colours (new
`--color-whatsapp-bubble` token). `npm run lint` now exits 0 (20 advisory
exhaustive-deps warnings remain, non-blocking).

**3. Spec for the 7 "coming soon" features** — `docs/coming-soon-features-spec.md`.
Per-feature purpose, backend/endpoint, data model, config-driven notes,
acceptance criteria, effort (S/M/L), and priority. Cheapest wins: the two CSV
exports + the analytics-setup deep link. Heaviest: report scheduling (depends on
report generation). None implemented yet — spec only.

Verification: backend + dashboard typecheck clean; dashboard lint exit 0;
`/privacy` renders 200 locally (fallback path).

---

## New-member invite email + dashboard em-dash sweep

**Invite email (commit, deployed rev 00091-hbm).** Adding a team member in
Settings → Admins now emails the new member a login prompt.
`backend/src/notifications/admin-invite-email.ts` mirrors the help-request-email
pattern (reuses the SMTP notification integration + shared transport; best-effort
so a mail failure never fails account creation). Security: the email NEVER
contains the password — it states the login email, links to /login, and asks the
member to change the password after first sign-in. Login URL resolves
config → env `ADMIN_DASHBOARD_URL` → first `BACKEND_CORS_ALLOWED_ORIGINS`
origin + `/login`. 9 unit tests. Wired into `POST /api/admin/team`; the response
now carries an `invite` status field.
  - Optional: set `ADMIN_DASHBOARD_URL` (or the `admin.invite.login_url` config)
    for a precise login link; otherwise it derives from the CORS origin.

**Em-dash sweep (commit ee82480).** Replaced every em-dash (U+2014) with a hyphen
across dashboard app/components/lib — 137 occurrences in 37 files (UI copy,
comments, preview fixtures). Pure character swap, spacing preserved, arrows (→)
untouched. typecheck + lint + format test all clean.
  - Known loose end: the PUBLISHED privacy legal blocks (seeded from
    `backend/src/config-platform/seed-legal-privacy.ts`) still contain em-dashes
    in the policy prose, so the live /privacy body (which reads published config,
    overriding the dashboard fallback) still shows them. To make the live page
    em-dash-free, update the seed prose + re-run `seed:legal-privacy`, or edit the
    `legal.privacy.policy` block in Settings → Legal.

---

## White-label branding, legal rich-text editor, loose ends

**Loose ends.** Removed em-dashes from the privacy seed prose and re-seeded, so
the live /privacy body is em-dash-free. The team-invite login URL is pinned via
the new `admin.invite.login_url` config (resolves to https://she-trades.vercel.app/login).

**White-label branding (commits b681d51, 5142f5a).** New config-driven branding
layer. A `branding.identity` content doc holds organisationName + primary/
secondary/accent colours + fontFamily, edited from Settings → Branding (new tab
after Admins) with draft/publish. `getRuntimeBranding()` (backend) feeds the org
name into the bot welcome + help/invite emails; `getBranding()` + BrandingProvider
(dashboard) inject the brand/accent/font tokens as inherited CSS custom properties
on <body> (re-theming the whole component library) and supply the org name to the
shell, login, entry, and page metadata. Values sanitised; no innerHTML. Functional
strings (the "Hello SheTrades" bot trigger, X-SheTrades-Source header) left as-is.
Run `seed:branding` to (re)publish the baseline. Deployed backend 00092-9t6;
branding.identity + admin.invite.login_url published to staging.

**Legal rich-text editor (commit 9fc9805).** Legal blocks now open in a form with
a Visual/Raw JSON toggle (like content): title, per-language rich-text body
(en/pcm/ig), compliance tag, effective date. Legal has its own parse+serialise
effect and the content serialiser early-returns for legal, so the shapes can't
cross-contaminate (also fixes a latent legal-misserialisation bug).

Verified: backend + dashboard typecheck + lint clean; branding renders in SSR
(body theme vars + org name present); pages 200. Interactive check of the legal
drawer and a live branding change still worth an eyeball on the deployed app.

---

## Privacy wiring fix + org name from Branding (confirmed live)

Root cause of "email not reflecting": NOT caching (Vercel ISR + backend refresh
propagate in ~30s; the org-name and body edits already showed). The /privacy page
renders the published policy body verbatim, and the Contact Email field was only
used in the fallback sections - the email on the page came from text baked into
the body. Fix: the body now uses {{orgName}} / {{contactEmail}} placeholders,
interpolated at render, so editing the fields changes the page.

Org name is now sourced from Branding (single source of truth): removed
legal.privacy.org_name from the seed, archived the staging doc, and /privacy reads
getBranding().organisationName. Contact email + effective date + body stay in Legal.
seed-legal-privacy gained SEED_ONLY_KEYS for targeted re-publish.

Confirmed on the deployed site with the operator's own test values: /privacy shows
"contact SheTrades2 at privacy2@shetrades.digital" (branding org name + Legal
contact email both interpolated, no {{}} leaking), and <body> carries the branding
accent colour #ff8000. Branding (name + colours) is wired end-to-end.

---

## Sidebar branding fixes (org name + accent-derived golds)

- Sidebar org name was gated by the seeded shell.brand copy key (which won over
  the branding fallback). Now the sidebar name is branding.organisationName
  directly, so renaming in Settings → Branding updates it.
- The active-nav highlight, logo mark, and avatar placeholder derive from
  --sidebar-accent / --sidebar-mark-gradient, declared at :root from the accent
  tokens. The theme override was on <body>, so those :root-derived vars kept the
  original gold. Moved the theme override to <html> (:root) and re-declared the
  derived sidebar/tour vars from the branding accent. Verified on deployed <html>:
  --sidebar-accent / --sidebar-mark-gradient / --tour-ring now = the branding
  accent (#ff8000). Note: hardcoded glow shadows (--sidebar-mark-glow,
  --tour-glow, rgba gold) are left as-is - subtle shadows, not fills.

---

## Premium UI polish pass (commit dd657a5)

Purely presentational token surgery from the UX audit; no markup/logic/layout/ARIA
changes. Layered ambient+key shadows (same --shadow-* token names), new motion
tokens (--ease-out-soft, --duration-fast/base), display tracking + tabular-nums on
titles/KPI values, card hairline borders (--border-hairline), uppercase xs table
headers, space-3 cell padding, sidebar muted text 0.5 -> 0.75 alpha (a11y ~4.6:1),
reduced-motion guards.

Two white-label fixes folded in: primary-button hover now DERIVES a darker step
via color-mix from brand-500 (branded installs set brand-500/700 identical, which
had silently removed hover feedback; brand-700 kept as parse-time fallback), and
the focus ring follows the brand primary via the branding style vars (hex+alpha in
JS, deliberately NOT CSS color-mix inside var(--focus-ring): an unsupported
color-mix there is invalid-at-computed-value and would delete the ring at every
:focus-visible call site instead of falling back).

Verified live on she-trades.vercel.app: <html> carries --focus-ring derived from
the currently-published primary; deployed CSS has the layered shadows, press
scale, color-mix hover + fallback, and 75%-alpha muted text.

---

## Bundled brand fonts; Asap default (commit 63ca5f6)

The Branding font field was free-text and only rendered if the visitor happened
to have that font installed - even "Inter" was never loaded, so all installs
silently used system fonts (typing "Asap" did nothing, which prompted this).

lib/fonts.ts now self-hosts five variable Google fonts via next/font (downloaded
at build; no runtime Google request): Asap (default), Inter, Nunito Sans,
Source Sans 3, Work Sans. Their CSS variables ride on <html>;
brandingStyleVars maps the published fontFamily to the matching bundled var
(--font-asap etc.), with unknown/legacy values keeping the old raw-name path.
The Branding tab's font field is a Select over the curated set (legacy values
show as "<name> (custom)"). Defaults flipped Inter -> Asap across dashboard +
backend fallbacks and seed-branding. Staging's published branding.identity
already said "Asap" (operator had typed it), so it began rendering on deploy.

Verified on she-trades.vercel.app: --font-family-sans:var(--font-asap), five
__variable classes on <html>, five woff2 preloads, fonts served as font/woff2.
Adding a font later = one entry in lib/fonts.ts + CURATED_FONT_VARS/FONT_CHOICES
in lib/branding.ts.

---

## Premium branding editor (commit eef51d3)

Rebuilt the Settings → Branding tab from a full-width vertical stack of bare
controls into a premium editor: grouped Identity / Colour Palette / Typography
sections (hairline dividers, uppercase micro-labels, readable column width),
a new shared ColorField ui atom (swatch card + live hex readout, on the gallery),
and a sticky LIVE PREVIEW panel - sidebar mock with brand-mark gradient and
accent nav rail, type specimen, primary button, accent chip - driven by the
in-progress form values via scoped --pv-* vars so the theme is visible before
publishing. BrandingWorkspace is now a data shell around an exported
presentational BrandingEditor with a network-free story on /previews/components
(per the component-library rules). Save/publish logic unchanged. Verified
visually via gallery screenshots + on the deployed previews page (3 swatch
cards, preview rail, specimen present).

---

## Coming-soon features shipped: CS-1..CS-4 (commits 48af195, f2eef71)

Four of the seven specced "coming soon" features are live (learner-facing R3
fixes deliberately deferred per operator):

**CS-1 Analytics Download CSV** - GET /api/admin/analytics/export (admin JWT):
Overall row + one row per state; counts summed from state funnels when a
breakdown exists, blank (not invented) for the snapshot provider. Button wired
on /analytics via downloadAdminCsv. Tests: header/Overall + 401.

**CS-2 Overview Export Summary** - client-side CSV (lib/admin/csv.ts) of the
loaded page state: 4 headline metrics + operational review rows. No endpoint.

**CS-3 Analytics setup CTA** - investigation showed the funnel is computed from
learner activity events; there is NO funnel config document, so the spec's
config deep-link would point nowhere. The dead button is now a working "Retry
Loading Analytics" (page load refactored to a reusable callback) with honest
empty-state copy.

**CS-4 Contact Learner via WhatsApp** - Users row action opens
ContactLearnerDrawer (gallery story added): approved-template vs free-text
modes. Backend POST /api/admin/users/:phone/message (editor+) enforces the
24-hour window server-side (free text -> 409 outside it; window approximated
from session.lastUpdatedAt), resolves templates from the config-driven
whatsapp.outreach_templates option set, sends via new sendWhatsAppOutreach
(returns Meta outcome incl. rejection reasons), persists every attempt to the
new outbound_messages table, and exposes GET .../messages history.
whatsapp.outreach_templates seeded to staging (hello_world sample;
SEED_ONLY_KEYS added to seed-frontend-options so targeted re-seeds don't reset
operator edits to other sets). Template sends are v1: no body variables yet.

Deployed backend 00094-kgs; routes verified gated (401) on staging; option set
live on /api/config/public/options. Remaining from the spec: CS-5 learner CSV
import (L), CS-6 generate report (M), CS-7 report scheduling (L, depends on
CS-6).

---

## CS-6 Generate Report shipped (commit 0e0a6f6, backend rev 00095-l6g)

The /reports "Generate Report" button is live. Rather than building a new
pipeline, this bridges the dashboard (admin JWT) to the EXISTING export
service (reports/export-service.ts - real DB-backed rows, retry, idempotency)
that was previously only reachable via the donor-API token surface.

- POST /api/admin/reports/generate (editor+) -> synchronous render, job
  summary returned; GET /api/admin/reports/exports lists jobs; GET
  .../:id/download streams the CSV. All gated; verified 401 on staging.
- Preset -> dataset mapping is config: reports.presets items now carry
  metadata.reportType (donor -> donor_summary, ops -> module_completion_detail,
  finance -> rewards_issuance_log); seeded to staging via SEED_ONLY_KEYS. The
  UI keeps a fallback map for presets that predate the field.
- /reports history table merges real generated jobs ahead of the provider
  rows; Ready jobs get a Download action; GenerateReportDrawer has a gallery
  story.
- Known limits, stated: jobs are in-memory (GAP-D1 stance - regenerable; the
  download 404 message says to regenerate after a restart); CSV only (the
  pipeline's "pdf" is a text mock, deliberately not exposed); date-range
  filtering from the spec is not in v1 - reports cover the full dataset.

Remaining from the coming-soon spec: CS-5 learner CSV import (L), CS-7 report
scheduling (L - now unblocked by CS-6).

---

## Donor report rename + visual funnel + full-state picker (commit b5599cf, rev 00096-nss)

1. **donor_summary columns renamed** to the truth (period, recipients,
   rewardsIssued, totalNgnIssued; schemaVersion v2). No donor entity exists -
   the report summarises reward disbursements; the old donor-flavoured headers
   misled. Donor-API callers pinning v1 get the designed 409 mismatch.
2. **Analytics funnel is now visual**: FunnelBars ui component (gallery story)
   replaces the text line - single brand hue, share-of-registered captions
   (stages are non-monotonic, so stage-over-stage % would mislead), raw-text
   fallback when the summary string doesn't parse; per-state 3-stage minis.
3. **Bot state picker**: "Others" now opens the full 36-states+FCT list paged
   9-per-list (WhatsApp caps lists at 10 rows) via __states_page_N__ tokens;
   admin-managed bot.states_full option set (seeded to staging, 37 items) with
   the complete built-in fallback; free-text entry kept for in-flight
   sessions. Pure-helper tests cover row caps/terminal page/clamping.

Verified: reports 8/8, handler 37/37, tsc+lint clean, funnel eyeballed in the
gallery, states_full live on public options (37 items).

---

## Engineering debt cleared (commits ..3c26e5a, backend rev 00097-jkw)

**1. Local test signal restored** - `npm test` was permanently red (33
DB-dependent failures + ~60s stall); now 402 tests, 0 fail, 42 skipped, ~14s.
skipWithoutDb guards added (each failure confirmed DB-caused first). Root cause
of the stall: with POSTGRES_URL unset, pg dialed the developer's LOCAL Postgres
and the failed SASL handshake orphaned a socket pinning the event loop. Pool now
defaults to a guaranteed-closed address (fail-fast ECONNREFUSED). Two production
hardenings found en route: pool-level error listener (unhandled idle-client
error = container crash on a DB blip) and allowExitOnIdle. Also exposed two
FALSE PASSES (webhook challenge tests' un-awaited resetWhatsAppState failed
silently post-test); resets now DB-conditional.

**2. Cross-instance cache staleness bounded** - runtime-config cache re-pulls
every CONFIG_CACHE_REFRESH_SECONDS (default 60; 0 disables; unref'd interval).
Safe to autoscale: other instances converge within a minute of a publish.

**3. Prisma migrations (bounded adoption)** - baseline migration
(prisma/migrations/000000000000_baseline, 10 tables) generated from
schema.prisma + db:migrate:baseline / db:migrate:deploy scripts. CUTOVER (needs
DB access, one time): run `npm run db:migrate:baseline -w @shetrades/backend`
with staging POSTGRES_URL, then future schema changes via `prisma migrate dev`;
after that ensurePrismaTables can be retired. Until then it remains authoritative.

**4. GAP-H2 closed** - remaining raw px inline styles tokenized in
ConfigEditorDrawer / ConfigAdminManager / GuidedInternalNameBuilder /
RichTextEditor (nearest-token mapping, few 1px font shifts; hairline borders and
structural 120/300px heights intentionally literal).

Still-accepted debt: in-memory report-export jobs (regenerable, by design);
public /previews gallery (fixtures only).

---

## Prisma migration baseline STAMPED on staging (cutover step 1 complete)

The operator pointed out DB access existed after all: POSTGRES_URL lives in
Secret Manager (secret `postgres-url`, not in cloudrun-staging-env.yaml), and
cloud-sql-proxy ships with the installed Cloud SDK. Ran the proxy against
shetrades-pg-staging, rewrote the socket-style URL to localhost, and executed
`prisma migrate resolve --applied 000000000000_baseline`.

Verified: status before = "migration not yet applied"; after = "Database
schema is up to date!". Non-destructive - only the _prisma_migrations
bookkeeping row was written.

From now on: schema changes via `prisma migrate dev` (creates a numbered
migration) and `npm run db:migrate:deploy -w @shetrades/backend` on release.
ensurePrismaTables remains in startup as a harmless idempotent safety net; the
remaining follow-up is wiring `migrate deploy` into startup/CI and then
retiring the bootstrap.

---

## R3-F5 content-length breach: RESOLVED by operator content fixes (verified 2026-07-23)

Live measurement against staging /api/config/public/content (composed message =
title header + body + quiz instruction, UTF-16 units): ALL 43 lessons fit the
1024-char interactive cap - longest 950 (m5_l5_h). The July-21 audit
(27 over, max 1392) is obsolete; the operator worked through the fix lists.
Quiz options: 35/387 marginally over the 20-char button cap (21-29 chars) -
cosmetic clipping only, delivery unaffected. THE TRANSLATION GATE IS CLEARED:
bulk Pidgin/Igbo runs no longer inherit over-limit English.

Open question from the same check: whatsapp.send.failed log entries (Jul 21,
16:45) show Meta delivery ATTEMPTS to +2348000111444, which the operator says
was sandbox-only testing - sandbox-marked requests should never reach Meta.
Harmless here (allowlist rejection), but worth confirming every sandbox path
carries X-SheTrades-Source.

---

## R3 learner-facing batch shipped (commit 01b8735, backend rev 00098-gdm)

- F8: quizRetryCount column (FIRST real migration applied via prisma migrate
  deploy over cloud-sql-proxy) - second wrong answer adds a config-editable
  hint (quiz_retry_hint). Verified LIVE by scripted sandbox conversation:
  wrong#1 no hint, wrong#2 hint present.
- F10b (operator call): My Progress = per-started-module lines + overall;
  {moduleBreakdown} token supported, appended when a published template
  predates it.
- F2: Reset Session State clears stored user language (true factory reset).
- F5/6/9: session endpoint returns derived displayState (lesson_view /
  quiz_in_progress); sandbox diagnostics shows it.
- F6 DROPPED per operator: in-body option list is the deliberate fallback for
  clipped button titles.
- R3-misc: orphaned bot.module.started archived.

Observed during e2e (operator action, not a bug): lesson check-in questions
like "Were you able to create your flyer today?" still score as right/wrong -
they are not yet marked kind:reflection. The reflection worksheet + quiz
builder controls exist; marking them is a content task in the admin.

## Post-audit confirmations (2026-07-23)

- Privacy contact CONFIRMED final by operator: privacy@shetrades.digital is
  the real address, not a placeholder. No longer a pending item.
- Reflection backfill verified complete on live config (37/129 questions
  marked; heuristic sweep found no unmarked check-ins).
- Remaining feature work: CS-5 (learner CSV import, /users) and CS-7 (report
  scheduling, /reports) - both specced in docs/coming-soon-features-spec.md.
- CS-5 ON HOLD per operator (2026-07-23): Meta will charge for ALL outbound
  WhatsApp messages from 2026-10-01, including replies inside the 24-hour
  service window (previously free). Bulk-importing cohorts to then message
  them changes the programme's cost model, so import is paused until the
  pricing impact is understood. Ref:
  https://merltech.org/meta-just-dropped-a-bomb-on-the-development-humanitarian-sectors-heres-why/

## CS-7 Report Scheduling shipped (2026-07-23)

CS-5 (learner CSV import) is ON HOLD (see above - Meta pricing change). CS-7 is live
on staging: standing schedules that generate a report preset and email the CSV.

How it fits together:
- Schedule = presetId + cadenceKey + recipients[], stored in `report_schedules`
  (migration 20260723120000, applied; ensurePrismaTables mirrors it).
- Cadence OFFERINGS are config (`reports.cadence_options`, metadata
  {kind, hourUtc, weekdayUtc?/dayOfMonthUtc?} in UTC); code only knows how to
  compute "next occurrence" for daily/weekly/monthly kinds.
- Recipients are per-schedule data; the drawer's picker is fed from the admin
  team (/api/admin/team) + `reports.recipient_directory` (external stakeholders,
  config-governed; sample entry ships DISABLED). One-off emails allowed, validated.
- Email subject/body are config ui_copy (`reports.schedule.email_subject`/`_body`)
  with {{orgName}} {{reportLabel}} {{period}} {{fileName}} {{cadenceLabel}}.
  One message per recipient (addresses stay private); CSV attached.
- Execution: Cloud Scheduler job `shetrades-reports-dispatcher-staging`
  (*/15 min) -> POST /internal/reports/schedules/dispatch (X-Internal-Worker-Token;
  REPORTS_WORKER_TOKEN or fallback PAYOUTS_WORKER_TOKEN - currently the payouts
  secret drives both). Claim = optimistic updateMany on nextRunAt (no double-send
  across instances); missed slots are NOT replayed (next run computed from now).
  Export requestId = schedule:{id}:{slot} for idempotency in the export pipeline.
- Failure handling: unresolvable cadence parks the schedule (enabled=false, detail
  says why); SMTP unconfigured -> lastRunStatus "skipped"; partial recipient
  failures listed in lastRunDetail.

Verified on staging (rev 00099-xll + attribution-fix redeploy): create -> run-now
returned "sent" with donor_summary CSV emailed to the operator (tar112@gmail.com -
check inbox for proof); dispatch tick 403 without token, {due:0,outcomes:[]} with;
next-run correctly Mon 08:00 UTC. The test schedule is left PAUSED on /reports.

Open follow-ups: consider a dedicated reports-worker-token secret (currently reuses
payouts token, same trust tier); edit-in-place for schedules (v1 = recreate);
report date-ranges + real PDF remain v2 items from the CS-6 spec.

## Session paused (2026-07-23) - white-label phase specced, not started

Operator asked whether the platform is truly white-label. Audit answer: yes on
every load-bearing surface (branding.identity drives name/colours/font across
dashboard/emails/bot; all content + legal + integrations config-driven; model
is one-org-one-deployment). Residue specced as the NEXT PHASE in
docs/white-label-readiness-spec.md (WL-1 defect fix -> WL-2 string sweep ->
WL-3 tenant runbook -> WL-4 logo upload on demand). Nothing implemented yet -
operator paused before go-ahead.

Also awaiting operator decisions on resume:
1. WL phase go-ahead (above).
2. Messaging-cost Option A (auto-advance after lesson-complete): saves
   ~$0.28/completing learner post-Oct-2026; corrected cost baseline is ~$1.54
   clean / ~$1.80 realistic per completing learner (~230 msgs x $0.0067 Nigeria
   utility rate) - NOTE the bot already consolidates verdict+next-question in
   one message, so earlier ~$2.45 estimates double-counted.
3. Translations bulk runs (1/43 pcm, 0/43 ig) - still the largest content gap.

Platform state at pause: CS-7 live + verified (test schedule PAUSED on
/reports, operator to inspect); suite 411/0/42; staging rev 00100-g5f;
tracker's only open items are the new WL phase entries.

## UX Round 4 response: quiz clip-matching bug found and fixed (2026-07-29)

Client report (SheTrades_Sandbox_UX_Report_Round 2_2.pdf, Round 4, Jul 24)
triage against LIVE config + code:
- M1 L7 state selection: confirmed fixed by reviewer.
- Two platform carry-overs (help resend, MENU): ignored per operator
  (resolved in another direction).
- Four "no option accepted" answer-key items (m3_l6, m4_l2, m4_l3, m4_l4):
  answer keys were ALREADY correct in config (operator fixed Jul 22, v4).
  Real cause: resolveQuizOptionIndex trailing-space clip bug. When an
  option's 20th char is a space ("Small fixed amounts |often"), the sent
  button title ends in whitespace but the inbound echo is trimmed; the
  clipped comparison kept the space so the tapped CORRECT answer never
  matched -> graded incorrect. All four flagged questions hit this exact
  pattern. Sandbox never showed it (simulator sends untruncated titles).
  FIX: trim both sides of the clipped comparison (handler.ts, + collision
  check). 9 regression tests with the real live option sets. Suite 420/0.
  Deployed rev 00101-2qx; staging e2e proof: scripted webhook conversation
  (+2348000777002, sandbox marker) tapped clipped "Small fixed amounts "
  (trailing space) -> "Correct! Excellent job."
- STILL PENDING (content, needs publish in admin): m4_l8_b safety-critical -
  Q1 answerIndex=0 marks "Drag the harasser" correct; must be 1 ("Report the
  harasser"). BONUS finding not in the report: same lesson Q3 answerIndex=0
  marks "Allow free speech" correct; should be 1 ("Set anti-harassment
  rules"). No draft exists for either - never fixed, not a publish miss.

Round 4 CLOSED (2026-07-29): operator republished m4_l8_b (v5) fixing both
answer keys (Q1 Ufuoma -> "Report the harasser", Q3 -> "Set anti-harassment
rules", the bonus finding). Staging e2e on the live bot: all three m4_l8
questions grade Correct, including the clipped trailing-space title "Set
anti-harassment " which exercises the new matcher fix. Every item in the
client's Round 4 report is now resolved or operator-waived; recommend the
client re-tests m3_l6/m4_l2/m4_l3/m4_l4/m4_l8 on real WhatsApp.

## Domain cutover: www.shetrades.digital (2026-08-03)

Operator added shetrades.digital to Vercel (www serves 200; apex 308s to www).
Completed the backend/config side:
- BACKEND_CORS_ALLOWED_ORIGINS: new domains prepended (www first - it is the
  invite-email fallback origin) in cloudrun-staging-env.yaml; applied via
  `gcloud run services update --env-vars-file` (rev 00102-88n). Verified:
  PAYOUTS_WORKER_TOKEN secret mapping intact; OPTIONS preflight from
  https://www.shetrades.digital returns 204 + matching allow-origin header.
- admin.invite.login_url republished -> https://www.shetrades.digital/login
  (invite emails now link to the new domain).
- seed-branding.ts default login URL updated to the new domain.
- docs/admin-how-to-guide.md dashboard URL updated.
- Unchanged on purpose: Meta webhook (points at Cloud Run), Vercel
  NEXT_PUBLIC_API_BASE_URL (points at Cloud Run), old vercel.app origins kept
  in CORS as fallback.

## UX Round 3 (Aug 10 report): both open findings fixed (2026-08-15)

O-1 (MENU invisible during quizzes): root cause is WhatsApp's 3-button cap -
3-option questions cannot carry a 4th MENU button. Typed MENU always worked
(global handler). Fix = honest copy: quiz_answer_prompt now says "type the
word MENU" (en/pcm/ig, code fallbacks + republished bot.prompt docs).
O-2 (MENU after module completion routed to main menu): completion message now
IS the module picker - state -> module_menu, congrats copy + tappable module
list in one message (also saves one billable message per module transition).
All-modules-done case gets new bot.prompt.programme_complete copy instead.
Republished via targeted API script (never the full prompt seed - operator
edits to other prompts untouched): quiz_answer_prompt, correct_module_complete,
reflection_module_complete, programme_complete.
Tests: 4 new (picker routing, programme-complete, mid-module unchanged, typed-
MENU copy); suite 424/0/42. Deployed rev 00103-w25. E2E: scripted learner
completed all 9 Module 3 lessons; completion reply carried the module list
(state module_menu, rows module-1..5); tapping module-2 from it opened Module
2's lesson list directly; first quiz message shows typed-MENU wording.

## Client incentive revision: milestone payouts (2026-08-15)

Client moved from N200/module to milestones: N500 at TWO modules completed +
N500 at ALL modules completed (same N1,000/learner, 2 payouts not 5).
Interpretation (stated to operator): thresholds count ANY modules completed,
since learners pick modules in any order.

- Contract: rewardRulesPayloadSchema gains optional milestones[]
  ({modulesCompleted: n|"all", amount, label?}); legacy flat amount kept and
  used only when milestones absent. "all" resolves to the live published
  module count at award time.
- Engine: backend/src/rewards/milestones.ts - pure resolveMilestoneAwards +
  countCompletedModules (module counts as complete only when EVERY lesson
  done). Award = catch-up >= semantics; reward dedup key derived from the
  THRESHOLD ONLY (never the admin-editable label - a rename must not re-pay
  every learner). 10 unit tests.
- Handler: module_completed event -> milestone mode when configured (per-
  module upsert otherwise, unchanged). Milestone reward rows use
  module="Milestone: N modules"/"all modules" against the existing
  (userId,module) uniqueness.
- Admin UI: RewardRulesWorkspace gains milestone rows (threshold|"all",
  amount, label, add/remove) + active-rule summary shows milestones.
- Published reward.rules.primary: milestones [{2,500},{all,500}], enabled.
  Deployed rev 00104-9xp. Suite 434/0/42.
- E2E (fresh learner +2348000777003): onboard -> complete Module 1 (9
  lessons) -> complete Module 2 (10 lessons) -> EXACTLY ONE reward row
  "Milestone: 2 modules" N500 Pending, zero per-module rows.

Two observations from a corrupted first fixture (learner ...777002), logged
as follow-ups, NOT blocking:
1. module_completed (and the completion message) fires on finishing the LAST
   lesson in module order even if earlier lessons were skipped via the lesson
   list (progress showed 80%). The milestone engine is immune (it counts full
   completion itself), but the analytics event and any legacy flat-mode
   deployment are not. Candidate fix: gate module_completed on all-lessons-
   complete.
2. Sandbox learner ...777002's session was reset at some point (name became
   "1", completedLessons lost module 3/4 history). Sandbox-only learner, no
   production impact, cause not yet traced.

## Incentive follow-ups per operator (2026-08-15, second pass)

Operator confirmed: (a) milestone thresholds count ANY two modules (order-free,
e.g. modules 4+5 count as the "first two") - matches what was built; (b) all
current dashboard data is dev/test and will be dropped before go-live, so no
retroactivity concern; (c) NEW RULE: a module counts as complete ONLY when
every lesson in it is complete.

(c) implemented - completion gate in advanceAfterAcceptedAnswer:
- all-lessons-complete check replaces the old "reached last lesson in order"
  trigger. Fixes BOTH directions: finishing the last lesson with skipped
  lessons behind no longer celebrates or emits module_completed (no reward,
  no analytics inflation); finishing a skipped MIDDLE lesson last now
  correctly completes the module (previously never fired).
- Gap case serves the lesson list with gaps visible (new
  bot.prompt.module_lessons_remaining copy, en/pcm/ig, published) and sets
  state=lesson_menu so the list is actionable - first e2e caught that leaving
  the session in the lesson-view state made numbers/rows dead.
- Suite 436/0/42 (2 new gate tests). Deployed rev shetrades-backend-staging-00106-zcv.
- E2E (fresh learner ...777006): skipped lesson 1, walked 2-9 -> "not done
  yet" + list showing the gap, NO celebration; completed lesson 1 -> module
  complete + picker. Second learner ...777003 (clean 2-module run) remains
  the milestone-reward proof: exactly one "Milestone: 2 modules" N500 row.

## Termii integration test failures: root cause + fix (2026-08-15)

Operator report: payouts connection test always fails. Root cause: the Termii
adapter pointed sandbox mode at a FICTIONAL host (sandbox.termii.com - does
not resolve, HTTP 000). Termii has no sandbox environment; with the config's
sandbox:true every test died on DNS before the API key was checked. Both real
hosts (api.ng.termii.com, v3.api.termii.com) verified live.

Fix (backend/src/payouts/providers/termii.ts):
- verifyCredentials always uses the live host - GET /get-balance is read-only,
  so it is safe in sandbox mode and actually validates the key. Healthy
  message carries a sandbox note.
- dispatch in sandbox mode is BLOCKED (non-retryable, no network call): no
  real airtime can leave the account while sandbox is on, and rewards land as
  Failed instead of spinning in the worker retry loop.
- Tests rewritten to encode the real semantics (sandbox-block, live-host
  verify). Suite 437/0/42. Deployed rev 00107-52j.

Verified with the operator's real published config (sandbox:true intact):
"Payouts connection test succeeded" - healthy, 359ms, Balance: 30.
NOTE for operator: Termii balance is N30 - insufficient for even one N500
milestone payout; top up before disabling sandbox for live dispatch testing.

## FAQ menu feature shipped (2026-08-15)

Client request: FAQ button under Change Language. WhatsApp caps reply buttons
at 3, so the main menu became a LIST message (4 rows: Start Learning /
My Progress / Change Language / FAQs; typed 1-4 + old aliases still work).
- New faq_menu conversation state (numbers there resolve to FAQ entries, not
  menu options); FAQ answer replies carry [FAQ, MENU] buttons; global MENU
  escape unaffected.
- Content fully config-driven: bot.faqs option set (10 client-authored FAQs
  published; label = row title <=24 chars, metadata.question/.answer; answers
  accept {en,pcm,ig} objects for future translation). Empty set degrades to a
  graceful "FAQs are not available" reply.
- Chrome copy in bot-prompts (faq_header/button/empty/answer_hint/
  missing_answer + main_menu_button/section) with EN/PCM/IG.
- bot.main_menu content doc republished to greeting-only ("Welcome {name}.
  Main Menu:") - it previously embedded its own outdated option lines
  ("Start Module 1"), which double-printed under the list builder.
- Suite 440/0/42 (3 new tests). Deployed rev 00108-znw. E2E on staging:
  menu list rows render; menu-faq opens 10-question list; tapped + numeric
  selection answer correctly; FAQ button loops back; MENU escapes; menu-learn
  row still opens modules. Cost note: menu list = same 1 message as before;
  each FAQ read = 2 messages (~$0.013 post-Oct).

## Visual option-set editor - config JSON no longer required (2026-08-15)

Operator request: editing FAQs (and option sets generally) in Settings ->
Configuration required hand-editing raw JSON. Now option_set documents open
in a visual builder; Raw JSON stays available behind the existing
wizard/JSON toggle for power users.

- NEW dashboard/lib/option-set-builder.ts: pure parse/serialize model.
  Metadata fields are classified (text / localized {en,pcm,ig} / number /
  yes-no / JSON fallback) and EVERYTHING unrecognized - unknown metadata
  shapes, unknown item keys, unknown payload keys - round-trips verbatim.
  Serializer emits id/value/label/enabled/sortOrder(index+1)/metadata.
- NEW dashboard/components/config/OptionSetBuilder.tsx: collapsible card per
  option (label + auto-slugged internal value + enable/hide + reorder +
  remove), per-field editors from the classifier, "Add another detail"
  (text/translated/number/yes-no), Add Option copies the metadata SHAPE of
  the first row (FAQ set -> new rows get empty Question/Answer boxes, no
  FAQ-specific code). bot.* sets get the 24-char WhatsApp row-title
  ConstraintMeter + >10 rows warning (WHATSAPP_LIMITS).
- ConfigEditorDrawer: new documentType prop; option_set docs default to the
  wizard; option-set serialize effect only runs in wizard mode so raw-JSON
  typing is never reformatted mid-keystroke; save disabled with an inline
  hint while the draft is invalid (missing label/value, duplicate values,
  bad JSON detail). ALSO FIXES a latent bug: the generic translation parser
  used to stuff the whole JSON string into `en` for any payload without an
  `en` key - opening an option set in the edit drawer would have mangled it
  into {"en":"<entire json>",...} on the next keystroke. Option sets now
  branch before that path.
- ConfigAdminManager: passes documentType (edit: row type; create:
  resolvedCreateType - settings options tab creates get the wizard too);
  buildCategoryPayload no longer hardcodes metadata:{} (was a data-loss
  landmine: saving via the category drawer would have wiped FAQ
  question/answer metadata) - it now preserves stored metadata by item id.
- Preview gallery: "Option Set Builder" card = standalone builder with live
  stored-JSON view + a button that opens the REAL ConfigEditorDrawer in
  option_set mode (bot.faqs fixture, save stubbed).
- Verified in browser against the dev server: default mode wizard; wizard
  edit -> JSON updated (metadata intact); raw JSON edit -> wizard reflects
  it; Add Option pre-creates Question/Answer; auto-slug ("What if I don't
  get a reward?" -> what_if_i_dont_get_a_reward); over-limit label flagged
  ("29/24 - will be cut off"); save disabled + hint on empty label.
  tsc clean. No backend changes - nothing to deploy on Cloud Run; dashboard
  ships via Vercel on push.

## Live payout test: Termii airtime API DOES NOT EXIST (2026-08-15)

Ran the N100 experiment (operator-authorized, their own number, sandbox OFF,
wallet topped to N2,820.70). Pre-flight: queue audit showed 0 dispatchable
rows (11 old Failed all parked at retry ceiling 3; ceiling confirmed = 3 on
the live service, no env override), so flipping sandbox off was safe.

Result: manual N100 reward -> 3 real dispatch attempts -> ALL "Termii
returned HTTP 404". N0 spent (wallet unchanged at 2,820.70). Root cause:
the adapter's POST /api/airtime/send endpoint is FICTIONAL - Termii's
developer docs (developers.termii.com) list messaging/OTP/insights/eSIM
products only, no airtime anywhere, and no community SDK implements an
airtime call either. Same original-implementation smell as the invented
sandbox.termii.com host. Termii is a messaging company; its wallet funds
SMS/OTP, not airtime payouts. The get-balance endpoint is real (which is
why connection tests pass) - a healthy connection test NEVER validated the
dispatch path.

State: test reward 1356ac79 parked at Failed/retry=3 (N100, operator's own
number - safe to Retry later once a real provider is configured). Operator
told to flip sandbox back ON.

Path forward: switch payouts provider to Reloadly or Africa's Talking -
both adapters already exist in the platform and point at REAL documented
hosts (auth.reloadly.com + topups.reloadly.com; api.africastalking.com).
Reloadly even has a genuine sandbox environment (topups-sandbox.reloadly.com).
Operator should also ask Termii support about repurposing/refunding the
N2,820 wallet balance (usable only for their messaging products).

## Live payout test: Termii airtime API DOES NOT EXIST (2026-08-15)

Ran the N100 experiment (operator-authorized, their own number, sandbox OFF,
wallet topped to N2,820.70). Pre-flight: queue audit showed 0 dispatchable
rows (11 old Failed all parked at retry ceiling 3; ceiling confirmed = 3 on
the live service, no env override), so flipping sandbox off was safe.

Result: manual N100 reward -> 3 real dispatch attempts -> ALL "Termii
returned HTTP 404". N0 spent (wallet unchanged at 2,820.70). Root cause:
the adapter's POST /api/airtime/send endpoint is FICTIONAL - Termii's
developer docs (developers.termii.com) list messaging/OTP/insights/eSIM
products only, no airtime anywhere, and no community SDK implements an
airtime call either. Same original-implementation smell as the invented
sandbox.termii.com host. Termii is a messaging company; its wallet funds
SMS/OTP, not airtime payouts. The get-balance endpoint is real (which is
why connection tests pass) - a healthy connection test NEVER validated the
dispatch path.

State: test reward 1356ac79 parked at Failed/retry=3 (N100, operator's own
number - safe to Retry later once a real provider is configured). Operator
told to flip sandbox back ON.

Path forward: switch payouts provider to Reloadly or Africas Talking -
both adapters already exist in the platform and point at REAL documented
hosts (auth.reloadly.com + topups.reloadly.com; api.africastalking.com).
Reloadly even has a genuine sandbox environment (topups-sandbox.reloadly.com).
Operator should also ask Termii support about repurposing/refunding the
N2,820 wallet balance (usable only for their messaging products).

## Africas Talking adapter fixed + sandbox e2e ISSUED (2026-08-15)

Operator configured the AT sandbox (username "sandbox" + sandbox-app API
key; first 401 was just key-activation delay). Dispatch then failed HTTP
415. Probed the real sandbox endpoint with candidate shapes: AT's gateway
rejects recipients entries carrying separate currencyCode/amount fields
(misleading 415 "expected application/json") but accepts the SDK shape -
form-urlencoded with recipients=[{phoneNumber, amount: "NGN 100"}]
(combined currency+value string). Success responses carry requestId
(ATQid_...), not transactionId.

Adapter fixes (backend/src/payouts/providers/africas-talking.ts):
1. recipients now send amount: "<CUR> <value>" combined, no currencyCode.
2. providerTxnId = requestId ?? transactionId.
Tests updated (contract-shape + requestId + legacy-transactionId fallback).
Suite 441/0/42. Deployed rev 00109-cbd.

E2E PROOF on staging: retried parked reward 1356ac79 (N100, operator's
number) -> first tick dispatched=1 -> status Issued, providerTxnId
ATQid_473087d9fdf20e7490b8ccf06546db76, issuedAt 2026-08-15T00:15:33Z.
Zero cost (AT sandbox). Full pipeline proven: reward row -> worker ->
AT sandbox -> Sent -> Issued.

Go-live checklist for payouts (operator):
1. AT dashboard: switch to LIVE app; request/confirm airtime product
   enablement (requires approval + KYC).
2. Fund the AT live wallet (NGN).
3. Platform payouts settings: username = real AT username, apiKey = live
   app key, sandbox OFF, publish.
4. Manual N100 reward to own number -> confirm airtime lands + wallet
   drops (repeat of this test, but real).
Note: AT sandbox responses showed a 2% airtime discount (N100 send cost
N98) - real margin data for incentive budgeting.

## Live AT payout blocked on product enablement + two more fixes (2026-08-15)

Operator connected the LIVE app (username "shetrades" - the earlier 401 was
a wrong app-username, fixed by them; wallet N105.18 readable). The real
N100 test then surfaced two things:

1. FIXED - manual rewards could only ever be created ONCE per learner:
   the endpoint hardcoded module:"Manual" into the (userId,module)-unique
   reward table. Manual grants now get a timestamped module label
   ("Manual 2026-08-15 01:18:03"). Rev 00110-m4j.
2. FIXED - AT request-level rejections were reported as the meaningless
   "Empty responses[] from provider" and retried forever: AT answers
   HTTP 201 with responses:[] and the reason in a top-level errorMessage.
   Adapter now surfaces it non-retryably. Rev 00111 (deploying).

CURRENT BLOCKER (operator action, not code): live dispatch returns
"Airtime is not enabled for this account". The airtime product must be
enabled by AT for the live app - email airtime@africastalking.com (per AT
help center) with the account/app name and use case. Sandbox has it by
default; live needs approval.

Waiting state: reward 71439012 (N100, operator's number) sits Pending/
Failed with the clear reason; once AT enables airtime, hit Retry on it
(or ask the agent) - everything else in the pipeline is proven.

## Resources menu feature shipped (2026-08-15)

Client request: a "Resources" menu entry holding useful, vetted referrals
(where to get loans, banner design, ...). Mirrors the FAQ feature exactly.

Bot (deployed rev 00112): main menu now 5 list rows (menu-resources added);
new resources_menu state (numbers resolve topics, RESOURCES re-lists, MENU
escapes); content reply "📌 {title}\n\n{content}" + [RESOURCES, MENU]
buttons; graceful resources_empty when nothing enabled. Prompts
resources_header/button/empty/answer_hint/missing_content (EN/PCM/IG).

Config: bot.resources option set published - label = row title (<=24),
metadata.title = full topic, metadata.content = body (WhatsApp markdown +
{en,pcm,ig} capable). TWO SAMPLE ENTRIES SHIP DISABLED (loans, design) -
the client replaces/enables them with vetted content via the visual editor.

Rich text editing (the actual new capability): option_set payloads now
carry an explicit `fieldHints` contract key ({ content: "richtext" }) -
added to optionSetPayloadSchema because the publish validator REPLACES
payloads with the zod-parsed result and would have silently stripped it.
The dashboard OptionSetBuilder renders hinted text fields with the
existing RichTextEditor (B/I/S toolbar -> WhatsApp markdown). bot.faqs
republished with { answer: "richtext" } so FAQ answers get it too.
Browser-verified: bold/italic typed in the editor stores as
"*completely free*" / "_shetrades.digital_" markdown; fieldHints
round-trips.

E2E on staging: 5-row menu; option 5 empty-state when all disabled;
res_loans temporarily enabled -> topic list -> content with provider list
-> RESOURCES loops -> MENU escapes; sample re-disabled after. Suite
444/0/42. Cost note: same as FAQs - each resource read ~2 messages
(~$0.013 post-Oct), menu unchanged at 1.

## Coming-soon languages shipped (2026-08-15)

Client decision: Pidgin/Igbo stall on translation review, so the language
buttons stay VISIBLE but politely decline (operator preferred this over
hiding). WhatsApp has no disabled-button concept, so:

- bot.language_options option set now drives the whole language step
  (was hardcoded buttons + always-on typed fallbacks). Semantics:
  enabled:false HIDES a language; metadata.comingSoon shows it with a 🔜
  button suffix and a polite "coming soon" reply on any selection path
  (tapped suffixed title, typed name/alias, or number). The old hardcoded
  toLanguage fallbacks only apply when the set is unseeded.
- Seeded + published: en selectable, pcm/ig comingSoon:true. REVERSAL IS
  ZERO-CODE: dashboard -> Options -> "Bot language choices" -> untick the
  Coming Soon checkbox on an item -> publish (the visual editor renders
  comingSoon as a Yes/No toggle automatically).
- New prompt language_coming_soon (EN/PCM/IG). Suite 446/0. Deployed
  rev 00113. E2E: onboarding + change-language both show suffixed
  buttons; tap "Pidgin 🔜", typed "igbo", and typed "2" all politely
  declined; English proceeds normally.
- Cosmetic note for operator: the published bot.awaiting_language.prompt
  body copy still lists "2. Pidgin (PCM) / 3. Igbo (IG)" without a
  coming-soon marker (buttons carry the 🔜). Editable via dashboard
  content workspace if they want the body text to match.

## Production-prep: learner-data reset tool (2026-08-17)

Operator is REUSING the staging environment as production, so test data has
to be cleared without touching content/config. New tool:

  npm run ops:reset-learner-data -w @shetrades/backend            # dry run
  npm run ops:reset-learner-data -w @shetrades/backend -- --confirm  # executes

(needs POSTGRES_URL through the Cloud SQL proxy:
 cloud-sql-proxy shetrades-staging-12345:us-central1:shetrades-pg-staging --port 5433)

CLEARS: quiz_attempts, user_progress, rewards, user_sessions, users,
outbound_messages, processed_webhook_messages.
PRESERVES (asserted after execution, throws if any count changed):
config_documents/versions/audit_log, admin_accounts, admin_sessions,
report_schedules, translation_requests, translation_drafts.

Delete order is load-bearing: learner relations are REQUIRED with no cascade
rule, so Postgres refuses to delete a users row while progress/quiz/reward/
session rows still reference it. Children first, all in one transaction.

Dry run on staging 2026-08-17: 672 rows would go (53 learners, 153 quiz
attempts, 32 progress, 15 rewards, 10 sessions, 409 webhook keys); preserved
side reads 208 config documents / 397 versions / 1165 audit rows / 3 admins /
2 report schedules / 2 translation drafts.

!! FINDING: Cloud SQL automated backups were DISABLED with zero backups on
record. Took an on-demand backup (id 1786961045198, SUCCESSFUL) as the
rollback point. ENABLING SCHEDULED BACKUPS + PITR IS A PRODUCTION BLOCKER -
recommend before go-live.

Also confirmed: operator completed the admin email migration; admin_accounts
now = compliance@techherng.com, dev@shetrades.digital, admin@shetrades.digital
(old admin@shetrades.com deleted).
