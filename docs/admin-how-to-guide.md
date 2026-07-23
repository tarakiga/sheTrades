# SheTrades Admin How-To Guide

A practical guide for platform admins: how to manage content and configuration,
manage admin users and permissions, publish/roll back changes, and troubleshoot
caching. No code changes are required for any task here — everything is done
from the dashboard.

- **Dashboard:** https://she-trades.vercel.app
- **Sign in:** use the email + password for your admin account. Press **Enter**
  or click **Sign in**. Sessions are role-aware and expire after the configured
  TTL (you'll be returned to the login screen when a session ends — just sign in
  again).

> **Roles at a glance**
> - **Admin** — full access, including managing other admins.
> - **Editor** — manage content, configuration, and operations (cannot manage admins).
> - **Viewer** — read-only. Viewers can browse but cannot save, publish, or run mutations.

---

## 1. Managing content & configuration (add / edit / publish)

All changeable content and options are managed under **Settings** and **Content**
— never in code.

### Where things live
| Area | Where | What it controls |
| --- | --- | --- |
| Dropdowns / selectable options | **Settings → Options** | Option lists used across the product |
| Consent / legal / policy text | **Settings → Legal** | Legal & marketing copy (rich text) |
| Lessons & quiz content | **Content** | Curriculum lessons, languages, quiz questions |
| WhatsApp / Email / Payouts providers | **Settings → Integration** | Provider credentials & connection settings |
| Reward amount & delivery | **Settings → Rewards** | The reward rule the bot applies |
| Admin users & roles | **Settings → Admins** | The admin team (see §2) |

### The draft → publish workflow (config & content)
Compliance-sensitive content uses a strict draft/publish flow with full history:

1. Open the relevant workspace (e.g. **Settings → Options**, or **Content**).
2. Click **Create Draft** / **Edit** and make your changes in the editor.
3. **Save Draft** — your change is stored as a draft and is **not yet live**.
4. Review the draft (use **Preview** where available).
5. **Publish Live** — the draft becomes the published version the product serves.
   Each publish records who published it and when.

Drafts are safe to iterate on: nothing reaches learners until you publish.

### Editing legal / consent / marketing text
- Go to **Settings → Legal**, open the block, and edit using the rich text editor.
- Save as a draft, preview, then **Publish Live**. Every version is retained.

---

## 2. Managing admins & permissions (Settings → Admins)

Only **Admin**-role users can open this tab. (Editors/viewers get an "Only admins
can manage the admin team" message.)

### Add an admin
1. Click **Add Admin**.
2. Enter **email**, **full name**, choose a **role** (Admin / Editor / Viewer),
   and set a **temporary password** (≥ 10 characters).
3. Click **Create Admin**.
4. **Share the temporary password securely** with the new admin (e.g. a password
   manager — not email/Slack in plain text). They sign in and change it from
   **Profile → Password**.

### Change a role
- Use the **Role** dropdown on the admin's row. The change applies immediately.
- You cannot change **your own** role (prevents accidental self-lockout).
- The system enforces **at least one active Admin** — it will block a change
  that would remove the last active admin.

### Suspend / reactivate
- Click **Suspend** on a row → confirm. The admin is signed out and blocked from
  signing in until reactivated.
- Click **Reactivate** to restore access.
- You cannot suspend **your own** account, and you cannot suspend the **last
  active admin**.

### Reset an admin's password
- Click **Reset password** on the row, set a new temporary password, and share it
  securely. The admin changes it after signing in.

### Delete an admin
- Click **Delete** → confirm. This is permanent.
- You cannot delete **your own** account.
- The **root admin** (the env-seeded `ADMIN_AUTH_BOOTSTRAP_EMAIL`, e.g.
  `admin@shetrades.com`) is **protected** — its Delete button is disabled and the
  API rejects deletion. This guarantees the platform can never be locked out of
  admin management.

---

## 3. Integrations & connection tests (Settings → Integration)

Tabs: **WhatsApp**, **Notification (email)**, **Payouts**.

- Open a provider, **Create Draft** / **Edit**, enter credentials.
- Click **Test Connection** to validate the credentials against the provider
  before going live (WhatsApp/Email/Payouts each support this). A red result
  means the credentials are wrong or the provider is unreachable — fix and retest.
- **Save Draft**, then **Publish Live** so the runtime (bot / payouts worker)
  starts using them.
- The **WhatsApp Sandbox Simulator** (WhatsApp tab) lets you test the bot flow.
  "Reset" clears bot session state — use with care.

---

## 4. Rolling back a change

If a published config/content change causes a problem:

1. Open the same workspace (e.g. **Settings → Integration → <provider>**, or a
   config workspace).
2. In the **Draft & Publish** panel, use **Restore Previous** (rollback). This
   re-publishes the previous live version.
3. Confirm the live version label updates to the restored version.

History is retained, so you can always restore an earlier published version.

---

## 5. Troubleshooting caching & "stale data"

The product serves published config through a cached public API. After you
**Publish**, changes propagate within the cache window. If you don't see a change:

1. **Confirm you published** (not just saved a draft). The workspace shows the
   live version label.
2. **Reload** — most workspaces have a **Reload** button; otherwise refresh the
   page (data is fetched fresh on load).
3. **Check the data-source badge.** Pages show **Live Data** (green) or
   **Fallback Data** (amber). "Fallback" means the page could not reach the live
   API and is showing safe defaults — usually a transient backend/auth issue;
   reload, and if it persists, re-sign in (your session may have expired).
4. **Public config cache window** is short (≈60s). Wait a moment and reload.
5. If a page is stuck on **"Loading…"**, your session likely expired — return to
   the login page and sign in again.

---

## 6. Common issues

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Bounced to login mid-session | Session expired (or backend redeployed) | Sign in again |
| "Only admins can manage the admin team" | You're an Editor/Viewer | Ask an Admin |
| Save/Publish/Suspend returns Forbidden | Viewer role (read-only) | Ask an Admin/Editor |
| "At least one active admin must remain" | Last-admin guard | Add/activate another admin first |
| "This is a protected admin account" | Tried to delete the root admin | Use a different account; the root admin is intentionally undeletable |
| Page shows "Fallback Data" | Live API unreachable / session expired | Reload; re-sign in if it persists |

---

_Maintained alongside the codebase. The features above map to: Settings tabs
(Options/Legal/Integration/Rewards/Admins), Content, the config-platform
draft/publish workflow, and the admin-team management API
(`/api/admin/team`)._

## 7. Scheduled reports (Reports → Scheduled Jobs)

A schedule generates a report preset on a cadence and emails the CSV to a
recipient list automatically.

**Create one:** Reports → Scheduled Jobs → Create Schedule. Pick a preset
(managed in `reports.presets`), a cadence (managed in
`reports.cadence_options`), and recipients. Recipients come from three places:

1. **Your admin team** - active members from Settings → Admins appear
   automatically.
2. **The recipient directory** (`reports.recipient_directory` under Settings →
   Options) - external stakeholders (partner M&E contacts, client finance)
   who should receive reports but have no dashboard login. Add them once
   there (value = email, label = who it reaches), publish, and they appear in
   every schedule's picker. This list is version-controlled and attributed,
   so you always have a record of who receives beneficiary data. Disabling an
   entry there removes the person from future sends across all schedules.
3. **A one-off email** typed into the drawer - for recipients you do not want
   in the directory.

**Manage:** each schedule card shows cadence, recipient count, next run and
last run outcome. Pause/Resume stops or restarts it (resuming never back-fills
missed runs); Run Now sends immediately without touching the cadence; Delete
(admin role only) asks for confirmation.

**Email copy:** subject and body live in `reports.schedule.email_subject` /
`reports.schedule.email_body` (Settings → Config, content namespace) with
placeholders {{orgName}}, {{reportLabel}}, {{period}}, {{fileName}},
{{cadenceLabel}}. Sending uses the same SMTP integration as team invites
(Settings → Integration); if SMTP is disabled, runs record "skipped" instead
of failing silently.
