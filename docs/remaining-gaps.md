# SheTrades — Remaining Gaps (backlog for later pickup)

> Generated 2026-06-04 from a 4-way read-only audit (frontend, backend, bot/analytics,
> CLAUDE.md-compliance/infra/docs). Items marked **✅verified** were confirmed by reading the
> code during this pass; others are agent findings worth a quick confirm before fixing.
> Already-shipped work (admin API JWT gate, manual-reward picker, payouts Test Connection,
> reports token fail-closed, UI honesty pass, "Others" state) is NOT listed here.

Severity: **HIGH** = security / correctness / mandated deliverable; **MED** = real gap, plan it;
**LOW** = polish / hygiene.

---

## 1. Security & access control

- **[HIGH] ✅ `backend/src/routes/webhook.ts:38` — `POST /webhook/whatsapp/reset` is unauthenticated and calls `deleteMany({})` on all UserSession rows.** Any anonymous caller can wipe every learner's session in prod. → Gate behind admin JWT or an internal worker token; or restrict to sandbox env.
- **[HIGH] ✅ `backend/src/routes/webhook.ts:47` — `GET /webhook/whatsapp/session/:phone` is unauthenticated and returns full learner session (name, location, language, progress).** PII leak. → Gate behind `authenticateJwt`.
- **[HIGH] ✅ `backend/src/routes/admin.ts:25` — adminRouter mutations have no role guard.** All `/api/admin/*` writes (flag user, reward retry, mark-issued, manual reward) require only a valid JWT — a `viewer`-role session can mutate. → Add `requireRoles(["editor","admin"])` to the mutating routes (config-admin already does this).
- **[HIGH] ✅ `backend/src/routes/admin.ts:267,305,346` — audit-log actor always `null`.** Code reads `(req as any).adminUser`, but `authenticateJwt` sets `req.authUser`. Every payout admin action logs `actorId:null, actorRole:null` → no attribution (also violates the CLAUDE.md audit-trail mandate). → Replace with `req.authUser`; add `updatedAt`/version to the log line.
- **[HIGH] ✅ `.env.example:6–9` — real-looking secrets committed.** `ADMIN_CONFIG_JWT_SECRET` is an actual signed JWT, `ADMIN_AUTH_BOOTSTRAP_PASSWORD=Jsmile101!`, `ADMIN_AUTH_BOOTSTRAP_EMAIL` is live. → Replace with placeholders; rotate the staging bootstrap password (it's in git history).
- **[MED] Legacy in-memory routers mounted unguarded at `/api`:** `content.ts:28-68` (`POST/PUT /content/lessons`, publish), `learning.ts:8,14` (`GET /users/:phone`, `POST /progress`), and `rewards.ts` (known). They mutate/expose in-memory state, not the real DB path, so risk is lower — but they should be gated or removed. → Decide: gate behind auth, or delete if truly test-only.
- **[MED] `backend/src/validation/reliability-check.ts:57` — re-introduces the hardcoded `"local-dev-reports-token"`** that was just removed from `export-service.ts`. → Use only `process.env.ADMIN_REPORTS_API_TOKEN`; skip the report check when unset.
- **[MED] (known) Inbound Meta webhook signature verification (`X-Hub-Signature-256` + appSecret) not enforced** — soft sandbox-marker gate only. → Verify the HMAC signature on inbound webhooks.

## 2. "No hardcoded values" mandate (CLAUDE.md core requirement)

- **[HIGH] `backend/src/whatsapp/handler.ts:~335-415,460-637` — all bot conversation copy is hardcoded.** `getPrompt()` is an in-code table of ~13 localized strings (quiz instructions, correct/incorrect, "didn't understand", state prompts, etc.) and the main-menu / language button labels are hardcoded arrays. None are admin-editable. This is the single biggest mandate violation. → Serve each via `getRuntimeText()`/`getRuntimeOptionSet()` backed by config seeds; admins edit copy without a deploy.
- **[MED] ✅ `backend/src/admin/providers/postgres.ts:164-165` — analytics live SQL hardcodes `'Anambra'`/`'Delta'`.** New states added via `bot.state_options` never appear in analytics. → Drive from the existing `FS_LOCATION_VALUE_*` env mappings the Firestore path already uses.
- **[MED] Frontend hardcoded option sets / copy that should come from the config API:** analytics state tabs (Anambra/Delta) `analytics/page.tsx`; dashboard funnel tabs; reports presets `reports/page.tsx:122-140`; `RewardRulesWorkspace.tsx:99` `CHANNEL_OPTIONS`; `RewardsToolbar.tsx:36-48` `STATUS_PILLS`/`DATE_RANGE_OPTIONS`; manual reward defaults `rewards/page.tsx:35-36` (5000/airtime); `AdminShell.tsx:20-28` nav items. → Fetch from config namespaces; keep TS unions only as validation of allowed values.
- **[MED] Hardcoded business thresholds:** `payouts/worker.ts:20-22` (BATCH_LIMIT/RETRY_CEILING/BASE_DELAY); `learning/engine.ts:3-4,169` (LESSONS_PER_MODULE=3, QUIZ_PASS_PERCENT=70, fallback reward 200) in the legacy engine. → Move to env/runtime config.

## 3. Bot conversation-flow correctness

- **[HIGH] `backend/src/whatsapp/handler.ts:703-872` — stuck state.** When `awaitingQuizAnswer=true` but the quiz item is `undefined` (empty quiz / corrupted index), control falls through and the user is trapped (only MENU escapes). → Add an explicit else that resets `awaitingQuizAnswer` and re-prompts.
- **[HIGH] `backend/src/whatsapp/handler.ts:~1067` — message marked processed before `saveSession`.** If `saveSession` throws (DB down), the id stays in `processedMessageIds`, so Meta's retry is dropped as "duplicate" and the session never updates. → Add the id only after a successful save.
- **[MED] in-memory `processedMessageIds`** — won't dedup across Cloud Run replicas and is unbounded. → DB/Redis-backed dedup with TTL or capped LRU. (known)
- **[MED] `handler.ts:641-682` — module selection only accepts numeric input;** no name-based matching, and clipped button labels can fail. → Add fragment/name matching like `resolveState()`.
- **[MED] `handler.ts:228` — `list_reply` resolved by `.title` not `.id`;** non-ASCII labels (e.g. Igbo "Others") risk match failure. → Prefer the canonical `id`.
- **[MED] `handler.ts:493-498,596-604` — invalid-state re-prompt and progress summary use hardcoded English** (`"Please choose your state…"`, `lessons.length || 6`). → Localize via config keys; drop the `|| 6` magic total.
- **[MED] `backend/src/reports/export-service.ts:78-95` — report exports return mock rows, not real queries** despite real backing tables (`userProgress`, `reward`, `quizAttempt`). → Query Prisma for real export content.
- **[LOW] `handler.ts` — no `lesson_viewed` analytics event** → drop-off before quiz is invisible. → Emit on lesson open.
- **[LOW] `whatsapp/sender.ts:53` — buttons silently truncated to 3;** with 3+ modules the MENU/extra buttons are dropped. → Paginate via a list message or warn.

## 4. Resilience / scaling (multi-instance correctness)

- **[MED] In-memory singletons lost on restart / divergent across replicas:** **admin auth users+sessions** (`auth/service.ts:338` — a session minted on instance A is invalid on B), translation requests (`translation-requests/service.ts:26`), config-platform service cache, export jobs (`export-service.ts`). The admin-session one is the most user-visible. → Persist sessions to Postgres (schema shape already exists).
- **[MED] `backend/src/routes/admin.ts:33-40` — unvalidated reward filters.** `from`/`to` → `new Date(String(...))` (Invalid Date → bad SQL), `limit` → `Number()` (NaN → `LIMIT NaN`), `q`/`cursor` no length cap. → Validate with `z.coerce.date()` / `z.coerce.number().int().min(1).max(100)` / `z.string().max(200)`.

## 5. Config API contract & caching (mandate)

- **[MED] `dashboard/lib/config/contracts.ts` — frontend config contracts are plain TS types, not Zod.** Mandate requires validation on both client and server; the client casts API JSON unvalidated. → Mirror the backend Zod schemas and parse responses.
- **[MED] `dashboard/lib/config/api.ts:7` — `cache:"no-store"` everywhere;** backend already returns ETag + `Cache-Control` but the client never revalidates. Mandate requires client caching with version tags/cache-busting. → Use `next: { revalidate }` or an SWR/React-Query layer keyed on the version tag.

## 6. CI / tests / migrations

- **[HIGH] ✅ `.github/workflows/ci.yml` — the test suite never runs in CI.** Only lint, typecheck, format. 25 backend `*.test.ts` files (auth, config-platform, payouts, webhook, rewards…) run nowhere on push. → Add `npm run test -w @shetrades/backend` (DB tests may need a Postgres service container). Also add `next build -w @shetrades/dashboard`.
- **[MED] No Prisma migrations** — `ensurePrismaTables()` hand-codes `CREATE/ALTER … IF NOT EXISTS`, which can drift from `schema.prisma`. → Adopt `prisma migrate` (or generate + commit migration SQL).
- **[MED] `.env.example` missing `POSTGRES_URL`** — a fresh checkout following `.env.example` can't boot the backend. → Add it with the local docker value + comment.

## 7. Required deliverable — documentation

- **[HIGH] Post-deployment ADMIN HOW-TO GUIDE is missing.** CLAUDE.md mandates a step-by-step admin guide: add/edit/publish content, manage permissions, perform rollbacks via the UI, troubleshoot caching. `docs/` has a seeding guide + ops runbook but not this. → Create `docs/admin-how-to-guide.md` covering all five topics.

## 8. UI quality / design-system / a11y

- **[MED] Page data loads swallow fetch errors** (`users/page.tsx:38-51`, `reports`, `analytics`) — a rejected fetch leaves the page stuck on "Loading…". → Add `.catch` → error EmptyState.
- **[MED] Raw inline styles / hardcoded hex** bypassing design tokens: `ConfigAdminManager.tsx:2116-2157` (action buttons), `ConfigEditorDrawer.tsx` (many `style={}` + `#ef4444`/`#fffbeb`/`#d9fdd3`), `GuidedInternalNameBuilder.tsx:118`, `RichTextEditor.tsx:115`. → Tokenize; use `Button`/`Input`/`Select`.
- **[MED] Accessibility:** `Tabs.tsx:26` generic `aria-label="Tabs"`; `RewardRulesWorkspace.tsx:461` toggle lacks `aria-pressed`; `ConfigEditorDrawer` language toggles lack tab roles; `ConfigAdminManager` icon buttons rely on `title` not `aria-label`. → Add proper ARIA / descriptive labels.
- **[LOW] Missing component preview/story entries** (mandate: every shared component in the workshop): `AdminWorkspaceMetricStrip`, `RichTextEditor`, `Textarea`, `AdminRouteLoading`. → Add preview sections.
- **[LOW] `users/page.tsx:301` "Create Import Batch (coming soon)"** disabled button not on the intentional-disabled list. → Add to that list or remove until built.

---

### Suggested pickup order
1. **Security HIGHs** (§1): webhook auth, adminRouter role guard, audit-actor fix, `.env.example` secrets — small, high-impact.
2. **CI tests + admin how-to doc** (§6, §7) — mandated deliverables, unblock everything else.
3. **Bot stuck-state + dedup-before-save** (§3 HIGHs) — correctness, learner-facing.
4. **Config-manageability** (§2) — the largest theme; tackle bot copy first, then frontend option sets.
5. **Resilience / validation / caching / a11y / design-tokens** (§4, §5, §8) — as capacity allows.
