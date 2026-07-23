# White-label readiness — next-phase specification

**Status: SPECCED, awaiting go-ahead (operator paused work 2026-07-23).**

Context: the operator asked whether the platform can be deployed for another
organisation without being tethered to SheTrades. Audit verdict (2026-07-23):
the load-bearing surfaces (org name, colours, font, all learner content, legal
text, emails, integrations, reports) are already config-driven via
`branding.identity` and the config platform. What remains is a short
de-branding punch-list, one real defect, one missing capability (logo upload),
and a provisioning runbook. This document specs that work.

**Deployment model (decided, restate to avoid re-litigating):** one
organisation = one deployment (own GCP project / Cloud Run / Cloud SQL / Meta
WABA + number / SMTP / Vercel project). White-label-by-redeployment.
Multi-tenancy on a single instance is explicitly OUT OF SCOPE.

Legend — Effort: S < half day, M = 1–2 days, L = 3+ days.

---

## WL-1: Fix the privacy fallback defined-term (S, defect)

[dashboard/app/privacy/page.tsx:40](../dashboard/app/privacy/page.tsx) — the
FALLBACK privacy paragraph interpolates `${orgName}` but keeps the literal
defined-term: an org with unpublished legal config renders
`Acme ("SheTrades", "we", "us")`.

- Replace with `${orgName} ("we", "us")` (drop the branded defined-term
  entirely — safest for any org).
- Sweep the sibling fallback contact addresses:
  `CONTACT_EMAIL_FALLBACK = "privacy@shetrades.digital"` (same file) and
  `"help@shetrades.digital"` in
  [backend/src/notifications/help-request-email.ts:60](../backend/src/notifications/help-request-email.ts).
  Fallbacks must be org-neutral: derive from branding (e.g. omit the address
  and render "contact us via the details published by ORG" when no config), or
  a clearly generic placeholder that the seed overwrites. Never invent a
  domain the org does not own.
- `seed-legal-privacy.ts` keeps `privacy@shetrades.digital` as the *SheTrades
  deployment's* seeded value — that is per-org seed data, correct as is.

**Acceptance:** with NO legal/branding config published, /privacy renders with
zero "SheTrades" occurrences and no shetrades.digital addresses; with config
published, behaviour unchanged. Existing privacy tests updated.

## WL-2: Operator-visible string sweep (S/M)

Learners never see these, but another org's ADMIN would. Replace hardcoded
"SheTrades" with the branding org name (dashboard: `useBranding()`/
`getBranding()`; backend: `getRuntimeBranding().organisationName`):

1. [WhatsAppSandboxSimulator.tsx:302](../dashboard/components/integration/WhatsAppSandboxSimulator.tsx)
   — "SheTrades Assistant" header → `${organisationName} Assistant`.
2. Same file :40 and :256 — default input "Hello SheTrades" → `Hello ${organisationName}`.
3. Same file :45 — simulator hint copy mentions 'Hello SheTrades' → interpolate.
4. [ConfigEditorDrawer.tsx:1542 and :1948](../dashboard/components/config/ConfigEditorDrawer.tsx)
   — phone-mock "SheTrades Progress Engine" → `${organisationName} Progress Engine`.
5. [IntegrationSettingsWorkspace.tsx:259](../dashboard/components/integration/IntegrationSettingsWorkspace.tsx)
   and [integration/types.ts:102](../dashboard/components/integration/types.ts)
   — SMTP fromName default "SheTrades" → branding org name.
6. [PayoutsCredentialFields.tsx:304](../dashboard/components/integration/payouts/PayoutsCredentialFields.tsx)
   — placeholder "SheTrades" → org name (placeholder :237 "shetrades_prod" →
   neutral example like "yourorg_prod").
7. [backend handler.ts:950](../backend/src/whatsapp/handler.ts) — greeting
   trigger list hardcodes "shetrades". Externalise the greeting-trigger list to
   a `bot.greeting_triggers` option set (values = trigger words, seeded with
   the current list minus the brand word plus the org's own name at seed time);
   handler falls back to the current built-in list per the safe-defaults rule.
8. Login page / AuthPageShell: verify eyebrow/title comes from branding
   (believed done — confirm, fix if not).

Explicitly NOT renamed (invisible plumbing, zero user value, churn risk):
`X-SheTrades-Source` header, `service: "shetrades-backend"` health string,
`@shetrades/*` package names, localStorage tour keys
(`shetrades.content.tour.v1` — renaming re-triggers tours for existing
operators), gallery preview fixture data, test fixtures.

**Acceptance:** publish branding with organisationName "TestOrg" on a dev
stack → sandbox simulator, config phone mocks, integration defaults and login
all show "TestOrg"; `grep -ri shetrades dashboard/components backend/src`
returns only the exempt plumbing list + tests + seeds.

## WL-3: New-tenant provisioning runbook (M, docs only)

One ordered checklist (`docs/new-tenant-runbook.md`) an engineer can follow to
stand up Org B from zero. Content exists scattered across
backend-deployment-env-matrix.md, deployment-handoff-package.md,
backend-ops-runbook.md — consolidate, do not duplicate (link where detail
lives). Must cover, in order:

1. GCP project + billing; enable Run/SQL/Secret Manager/Scheduler/Build APIs.
2. Cloud SQL Postgres (tier guidance: db-custom-1-3840 baseline ≈ $53/mo),
   `postgres-url` secret (Cloud SQL socket format).
3. `payouts-worker-token` secret (+ optional dedicated reports token — see
   handoff follow-up).
4. First Cloud Run deploy (env-vars-file template — a sanitised
   `cloudrun-env.example.yaml` with every required var and placeholder values;
   real file stays untracked per git-hygiene rules).
5. `prisma migrate deploy` via cloud-sql-proxy (exact commands, from the
   migrations adoption work).
6. Meta: WABA, phone number, webhook URL + verify token, subscribe fields,
   at least one approved outreach template. Note the Oct-2026 per-message
   pricing and the ~$1.54/completing-learner cost model.
7. SMTP provider + `integration.notification.smtp` config via admin UI.
8. Vercel project, env vars (NEXT_PUBLIC_API_BASE_URL), custom domain,
   backend CORS origins updated.
9. Seed order (each idempotent, SEED_ONLY_KEYS supported):
   bot-prompts → frontend-options → legal-privacy (org's own contact) →
   branding (org's name/colours/font/login URL).
10. Admin bootstrap (ADMIN_AUTH_BOOTSTRAP_* envs), first login, invite team.
11. Cloud Scheduler jobs: payouts dispatcher + reports dispatcher (exact
    gcloud commands, token via secret, never printed).
12. Smoke checklist: /ready 200, sandbox conversation end-to-end, invite
    email received, report generated + scheduled-report run-now "sent",
    /privacy renders org text, dashboard shows org branding.

**Acceptance:** a dry-run against the staging stack confirms every step's
command syntax; no secret values appear in the doc.

## WL-4: Logo upload (M, feature — only if a client needs it)

`branding.identity` gains an optional logo. Current state: sidebar mark +
avatar are initials + accent gradient (acceptable default, keep as fallback).

- **Storage decision (recommended): data-URI in the branding config doc**,
  hard-capped at ~48KB (SVG/PNG), validated server-side (mime allowlist,
  dimension sanity, size). Rationale: inherits draft/publish/version
  history/rollback for free, no bucket provisioning per tenant, logos at this
  size are fine inline. A GCS bucket + signed upload is the fallback plan if
  clients bring photographic logos; do not build it speculatively.
- Branding tab: logo upload field with live preview (reuse the existing
  BrandingEditor preview pane), remove/reset to initials mark.
- Consumption: sidebar mark, login aside panel, browser favicon (optional,
  else keep emoji/default), email header line (text-only emails stay
  text-only — logo does NOT go into emails in v1).
- Sanitisation: SVGs must be sanitised (strip scripts/foreign objects) before
  publish — treat as untrusted input.

**Acceptance:** upload → draft preview → publish → sidebar/login show the
logo; unpublish/remove → initials mark returns; oversized/wrong-type rejected
with clear message; version history shows the change.

## WL-5: Custom font upload (L) — DEFERRED

The 5 curated next/font faces stay. Arbitrary font upload (licensing,
subsetting, self-hosting pipeline) is not justified until a client asks.

---

## Sequencing & estimate

WL-1 → WL-2 → WL-3 is "a day of work" total and makes the platform
demo-clean for any org. WL-4 is a separate M-effort feature, decision on
demand. Suggested order on resume: WL-1 (defect first), WL-2, WL-3, then stop
for operator review before WL-4.

## Also pending from the same session (separate decisions, not this spec)

- **Messaging-cost Option A (auto-advance after lesson complete)**: specced in
  conversation, saves ~$0.28/completing learner (~18%), awaiting operator
  go/no-go — trade-off is the lost breather between lessons. Guards: 1024-char
  runtime fallback + config kill-switch.
- **CS-5 learner CSV import**: ON HOLD (Meta pricing change).
- **Translations backlog**: 1/43 pcm, 0/43 ig — pipeline ready, bulk runs not
  started.
