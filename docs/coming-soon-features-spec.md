# "Coming soon" features — specification

Seven admin affordances currently render as **disabled** buttons labelled "(coming
soon)". This document specs each one so it can be picked up independently. Every
spec honours the project's data-driven mandate (nothing user-facing hardcoded;
options/copy/templates live in the config platform with safe fallbacks) and the
component-library rule (compose from `components/ui`, no one-off UI).

Legend — **Effort**: S ≈ <1 day, M ≈ 1–3 days, L ≈ 3+ days.

| # | Feature | Page | Effort | Priority |
|---|---------|------|--------|----------|
| 1 | Download CSV (analytics) | `/analytics` | S | High |
| 2 | Export Summary (overview) | `/dashboard` | S | Medium |
| 3 | Review Analytics Setup | `/analytics` | S | Medium |
| 4 | Contact learner | `/users` | M | High |
| 5 | Create Import Batch | `/users` | L | Medium |
| 6 | Generate Report | `/reports` | M | Medium |
| 7 | Create Schedule | `/reports` | L | Low |

The two CSV exports (1, 2) and the setup shortcut (3) are the cheapest wins and
reuse infrastructure that already exists (`downloadAdminCsv`, the config editor).
Contact learner (4) unlocks the most operator value. Scheduling (7) is the
heaviest and depends on Generate Report (6) landing first.

---

## 1. Download CSV — Analytics (`/analytics`)

**User story:** As an admin I export the analytics funnel (overall + per-state)
as a CSV so I can share progression numbers with donors/partners offline.

**Current state:** `app/(admin)/analytics/page.tsx` already loads
`AnalyticsPageData` (registration/completion/pass rates + `stateFunnels`). The
button is disabled. Users and Rewards already ship working CSV export via
`downloadAdminCsv(endpoint, filename)` + a backend `*ExportEndpoint()`.

**Backend:** add `GET /api/analytics/export.csv` (admin JWT, `viewer+`) that emits
the same figures the analytics API computes — one header row, one row per state
plus an "Overall" row (`state, registered, completed, passed, completionRate,
passRate`). Reuse the existing analytics aggregation; do not recompute in the route.

**Frontend:** replace the disabled button with
`onClick={() => downloadAdminCsv(analyticsExportEndpoint(), \`analytics-${today}.csv\`)}`
and add `analyticsExportEndpoint()` to `lib/admin/api.ts`. Mirror the Users page's
button exactly.

**Config-driven:** none required (raw data export).

**Acceptance:** button downloads a well-formed CSV matching the on-screen figures;
403 without a token; empty state exports headers only.

---

## 2. Export Summary — Dashboard overview (`/dashboard`)

**User story:** As an admin I export the overview snapshot (headline metrics +
operational review rows) so I can drop it into a status update.

**Current state:** `app/(admin)/dashboard/page.tsx` composes `operationalRows`,
the four headline metrics, and reward/at-risk tables from existing APIs.

**Approach (S):** client-side CSV — the page already holds all values in state.
Add a small `toCsv(rows)` helper in `lib/admin/` and a `Blob` download (no new
endpoint). Export the four metrics + the four operational rows (`area, signal,
status, source`). This keeps it a pure frontend change.

**Alternative (M):** a backend `GET /api/overview/export.csv` if we later want a
server-authoritative snapshot; not needed for v1.

**Config-driven:** none.

**Acceptance:** downloaded CSV reflects exactly what the loaded page shows;
disabled state shown while `loading`.

---

## 3. Review Analytics Setup — Analytics empty state (`/analytics`)

**User story:** When the funnel is unpublished, the empty state's CTA takes me
straight to the place I publish the analytics funnel configuration, instead of
telling me to "review setup" with nowhere to go.

**Current state:** button appears only when `!funnelReady` (no published funnel).

**Approach (S):** this is a navigation/help action, not a feature. Point the CTA
at the config document that drives the funnel — `router.push()` to the config
editor deep-link for the analytics funnel key (namespace `content` or a dedicated
`analytics` config doc), the same way the dashboard's "Configure Milestone Rule"
routes to `/settings`. Confirm the exact key the analytics funnel reads from and
deep-link to its editor drawer.

**Config-driven:** by definition — it routes the operator to the config UI.

**Acceptance:** CTA navigates to the funnel config editor; once a funnel is
published the CTA is replaced by the "ready" note (already implemented).

---

## 4. Contact learner — Users row action (`/users`)

**User story:** As an admin I send a WhatsApp message to a specific learner
(e.g. following up a help flag) without leaving the directory.

**Current state:** row action exists but is `disabled`. Help flags already surface
in the "Users requesting help" panel, so operators have a reason to reach out.

**Compliance (must design around):** outside the 24-hour customer-service window,
WhatsApp only allows **pre-approved template messages**. So:
- Message templates must be **config-driven** (new `options`/`legal`-style set,
  e.g. `whatsapp.outreach_templates`), each mapping to an approved Meta template
  name + variables. No free-text hardcoding.
- Free-text is allowed only if the learner messaged within 24h; otherwise the UI
  must force a template choice.

**Backend:** `POST /api/admin/learners/:phone/message` (admin JWT, `editor+`),
body `{ templateKey, variables? } | { text }`. Reuses the existing WhatsApp
integration config (`getRuntimeWhatsAppConfig`). Enforces the 24h/template rule
server-side. Persists an outbound-message audit row.

**Frontend:** a `ContactLearnerDrawer` (new library component) opened from the row
action and the `LearnerDetailDrawer`; template picker sourced from config, live
character gauges reusing the WhatsApp constraint meters.

**Data:** outbound message log (who/when/template/status) for audit + the panel.

**Acceptance:** template list comes from config; sending outside 24h without a
template is blocked with a clear message; success reflects delivery status;
action is audit-logged.

---

## 5. Create Import Batch — Users (`/users`)

**User story:** As an admin I bulk-import learners from a CSV (name, phone,
language, location) so onboarding a cohort doesn't require one-by-one entry.

**Backend:**
- `POST /api/admin/learners/import` (admin JWT, `admin`), multipart CSV upload →
  returns a batch id; parse + validate rows async.
- `GET /api/admin/learners/import/:batchId` → per-row status
  (`created | duplicate | invalid` + reason).
- Validation: E.164 phone normalisation, dedupe against existing learners,
  language/location validated against the **published option sets** (reuse the
  same option config the bot uses — no hardcoded lists).

**Data:** `import_batch` + `import_batch_row` tables (batch metadata + row
outcomes) to back the results view and re-runs.

**Frontend:** `ImportBatchDrawer` — upload, column-mapping step (mapping presets
config-driven), dry-run preview, then commit; results table reuses `Table` with
status badges. Wire into the existing "User Actions" card empty-state CTA.

**Config-driven:** column-mapping presets + the allowed language/location values
come from config; nothing about the CSV schema is hardcoded.

**Acceptance:** invalid/duplicate rows reported per-row without aborting the
batch; valid rows create learners; large files handled without timing out
(async batch); re-download of the results CSV.

---

## 6. Generate Report — Reports (`/reports`)

**User story:** As an admin I generate a donor/ops/finance report on demand and
download it, rather than only viewing past exports.

**Current state:** presets (`donor/ops/finance`) are **already config-driven**
(`reports.presets` option set); the export-history table already renders. Only
generation is missing.

**Backend:** `POST /api/reports/generate` (admin JWT, `editor+`), body
`{ presetId, from?, to? }` → assembles the preset's dataset (the preset metadata
already describes its contents), writes an export record (status `Queued` →
`Ready`), returns the export id. `GET /api/reports/:id/download` streams the file.
Preset → dataset mapping lives in config/metadata, not in code branches.

**Frontend:** replace the disabled button with a small "Generate" dialog (preset
select sourced from the existing config-driven `presets`, optional date range),
then poll the export row until `Ready` and surface a download link in the existing
history table.

**Config-driven:** preset definitions already are; the report's column/section
composition should also be described in the preset metadata so a new report type
needs no code.

**Acceptance:** generating a preset produces a downloadable file whose contents
match the preset description; the new export appears in history with correct
status transitions.

---

## 7. Create Schedule — Reports (`/reports`)

**User story:** As an admin I schedule a report (e.g. weekly donor report) to be
generated and optionally emailed automatically.

**Depends on:** #6 (Generate Report) — scheduling just invokes generation on a
cadence.

**Backend:**
- `report_schedule` table: `presetId, cadence (cron), recipients[], enabled,
  lastRunAt, nextRunAt, createdBy`.
- CRUD under `/api/reports/schedules` (admin JWT, `admin`).
- Execution via **Cloud Scheduler → a worker endpoint** (the project already uses
  Cloud Scheduler for payouts/rewards), which calls the generation path and, if
  recipients are set, emails the result through the existing SMTP notification
  integration (`sendHelpRequestEmail`'s transport).

**Frontend:** `ReportScheduleDrawer` (cadence picker with config-driven cadence
options, preset select, recipient list) wired into the "Scheduled Jobs" card;
list existing schedules with enable/disable + last/next run.

**Config-driven:** cadence options and default recipients come from config;
email templates for scheduled reports are config-managed like other notifications.

**Acceptance:** a schedule fires on cadence, generates the report, and emails
recipients; disabling stops future runs; failures are logged and visible.

---

## Cross-cutting notes

- **New components go in the library first** (`components/ui` or a feature folder)
  with a preview story under `app/previews/components`, per the component-library
  rules — `ContactLearnerDrawer`, `ImportBatchDrawer`, `ReportScheduleDrawer`,
  and the generate/export dialogs all qualify.
- **No hardcoded strings**: message templates, cadence options, mapping presets,
  and report definitions are all config documents with safe in-code fallbacks.
- **Auth**: every new mutating endpoint takes the admin JWT and the same
  role gates the rest of `/api/admin/*` uses (`editor`/`admin`).
- **Audit**: outbound messages, imports, generated reports, and schedule changes
  are audit-logged like existing config mutations.
