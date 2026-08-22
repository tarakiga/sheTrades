# Data Residency Migration: us-central1 → africa-south1

**Goal:** move participant data from Google Cloud's Iowa region to Johannesburg,
so Nigerian learners' personal data is processed on the same continent, and the
privacy notice can say so without a cross-border transfer clause.

**Also fixes:** `PUBLIC_BASE_URL` is currently unset in production, which means
certificate issuing would fail for the first learner who completes every module.
See "Blocking defect" below. This migration is the natural moment to fix it,
because the base URL changes anyway.

**Window:** roughly one working day, with a cutover of about 30 minutes during
which the bot does not reply. Best run early morning WAT, when learner traffic
is lowest.

---

## Current state, verified

| Component | Where | Detail |
|---|---|---|
| Backend | Cloud Run `shetrades-backend-staging`, us-central1 | URL `…-214511840103.us-central1.run.app` |
| Database | Cloud SQL `shetrades-pg-staging`, us-central1 | PostgreSQL 15, `db-custom-1-3840` (1 vCPU / 3.75 GB), 20 GB SSD, zonal, backups + PITR on |
| Secrets | Secret Manager, **automatic** replication | `postgres-url`, `totp-encryption-key`, `payouts-worker-token`, `whatsapp-sandbox-token`, `pg-ssl-ca-cert` |
| Cron | Cloud Scheduler, us-central1 | payouts dispatch every 5 min, reports dispatch every 15 min |
| Dashboard | Vercel | `she-trades.vercel.app`, points at the Cloud Run URL |
| Custom domain | **None** | Everything runs on the generated `run.app` hostname |
| Certificates issued | **Zero** | Confirmed against the live API |

## Blocking defect to fix first

`PUBLIC_BASE_URL` is not set on the Cloud Run service. `certificateUrls()`
throws on an empty base rather than emitting a relative link that WhatsApp
cannot fetch, so with issuing switched ON, the first learner to finish every
module gets no certificate and a logged failure.

Nothing has broken yet only because nobody has finished. This must be set as
part of the migration, and would need setting even if the migration were
cancelled.

## What cannot move, and why it does not matter

**Cloud Scheduler is not available in africa-south1** (confirmed: 30 locations,
none in Africa). The two cron jobs stay in us-central1 or move to europe-west1.

This does not affect data residency. Scheduler holds no participant data. It
fires a timed HTTPS POST carrying only a worker token; all data stays inside the
Johannesburg service it calls. Worth stating explicitly in the privacy review so
it is not mistaken for a gap.

**Secret Manager uses automatic replication**, meaning Google stores secrets
across multiple regions. The secrets hold connection strings and encryption
keys, not participant data. If the client wants strict residency for these too,
they must be recreated with user-managed replication pinned to africa-south1 —
which cannot be changed in place. Flagged as a decision, not a blocker.

---

## Preconditions

- [ ] **Client confirms the region.** Everything below assumes africa-south1.
- [ ] **Decide the custom domain.** Strongly recommended, e.g.
      `api.shetrades.digital` for the backend. Without it, every future hosting
      move breaks every certificate verification link ever issued. With zero
      certificates issued today, this is free to do now and expensive later.
- [ ] **Decide on secret replication** (above).
- [ ] **Confirm the maintenance window** with whoever fields learner messages.

---

## Task 1: Provision the target

- [ ] **Create the Cloud SQL instance**, matching the current shape:

```bash
gcloud sql instances create shetrades-pg-za \
  --database-version=POSTGRES_15 \
  --tier=db-custom-1-3840 \
  --storage-size=20 --storage-type=SSD \
  --region=africa-south1 \
  --availability-type=ZONAL \
  --backup --enable-point-in-time-recovery
```

- [ ] **Create the database and user** to match the current connection string.
      Read the existing name from the `postgres-url` secret; do not guess.
- [ ] **Verify the instance is up** and note its connection name
      (`PROJECT:africa-south1:shetrades-pg-za`).

## Task 2: Move the data

The dataset is small, so a plain dump and restore is simpler and more
inspectable than Database Migration Service.

- [ ] **Take a dump from the source**, through the Cloud SQL proxy:

```bash
pg_dump --no-owner --no-acl --format=custom \
  --file=shetrades-$(date +%Y%m%d).dump "<source connection string>"
```

- [ ] **Record the row counts** of the participant tables before restoring, so
      the post-cutover check has something to compare against:

```sql
SELECT 'users' t, count(*) FROM users
UNION ALL SELECT 'user_sessions', count(*) FROM user_sessions
UNION ALL SELECT 'user_progress', count(*) FROM user_progress
UNION ALL SELECT 'quiz_attempts', count(*) FROM quiz_attempts
UNION ALL SELECT 'rewards', count(*) FROM rewards
UNION ALL SELECT 'certificates', count(*) FROM certificates
UNION ALL SELECT 'certificate_assets', count(*) FROM certificate_assets
UNION ALL SELECT 'config_documents', count(*) FROM config_documents;
```

- [ ] **Restore into the new instance** and re-run the same query. The numbers
      must match exactly.

```bash
pg_restore --no-owner --no-acl --dbname="<target connection string>" shetrades-*.dump
```

- [ ] **Spot-check the config platform**: the published certificate template and
      the lesson documents must be present, since the bot is useless without
      them.

> This dump is a full copy of every participant record. Store it encrypted,
> delete it once the migration is verified, and do not leave it on a laptop.

## Task 3: Deploy the backend to africa-south1

- [ ] **Add `PUBLIC_BASE_URL` to `cloudrun-staging-env.yaml`**, set to the custom
      domain if one was chosen, otherwise to the new service URL (which is not
      known until after the first deploy — in that case deploy once, read the
      URL, then redeploy with it set).
- [ ] **Update `BACKEND_CORS_ALLOWED_ORIGINS`** if the dashboard's address is
      changing.
- [ ] **Deploy**, attaching the new database:

```bash
gcloud run deploy shetrades-backend-za \
  --source . --region africa-south1 \
  --env-vars-file cloudrun-staging-env.yaml \
  --add-cloudsql-instances "PROJECT:africa-south1:shetrades-pg-za" \
  --update-secrets POSTGRES_URL=postgres-url:latest,\
PAYOUTS_WORKER_TOKEN=payouts-worker-token:latest,\
WHATSAPP_SANDBOX_TOKEN=whatsapp-sandbox-token:latest,\
TOTP_ENCRYPTION_KEY=totp-encryption-key:latest \
  --quiet
```

- [ ] **Point `postgres-url` at the new instance.** Add a new secret version
      rather than editing; keep the old version so rollback is a version
      selection rather than a re-entry of credentials.
- [ ] **Hit `/health` and `/ready`** on the new service. `/ready` exercises the
      database, so a 200 proves the connection works.

## Task 4: Custom domain (recommended)

- [ ] Map the domain to the new service and add the DNS records Google returns:

```bash
gcloud beta run domain-mappings create \
  --service shetrades-backend-za --domain api.shetrades.digital \
  --region africa-south1
```

- [ ] Wait for the certificate to provision, then confirm `https://<domain>/health`.
- [ ] Set `PUBLIC_BASE_URL` to the custom domain and redeploy.

## Task 5: Cutover

Everything up to here is additive and reversible; the old system is still live
and serving. This is the only step with an outage.

- [ ] **Announce the window.**
- [ ] **Pause both Cloud Scheduler jobs**, so no payout or report runs against
      the old database mid-move:

```bash
gcloud scheduler jobs pause shetrades-payouts-dispatcher-staging --location us-central1
gcloud scheduler jobs pause shetrades-reports-dispatcher-staging --location us-central1
```

- [ ] **Re-run the dump and restore** (Task 2). The earlier pass was a rehearsal;
      this one captures anything that changed since. Row counts must match again.
- [ ] **Switch the Meta webhook** to the new address, in the Meta app's WhatsApp
      configuration. This is the moment the bot starts answering from
      Johannesburg.
- [ ] **Update the dashboard**: set `NEXT_PUBLIC_API_BASE_URL` in Vercel to the
      new address and redeploy.
- [ ] **Re-point the Scheduler jobs** at the new URLs and resume them:

```bash
gcloud scheduler jobs update http shetrades-payouts-dispatcher-staging \
  --location us-central1 --uri "https://<new base>/internal/payouts/dispatch"
gcloud scheduler jobs update http shetrades-reports-dispatcher-staging \
  --location us-central1 --uri "https://<new base>/internal/reports/schedules/dispatch"
gcloud scheduler jobs resume shetrades-payouts-dispatcher-staging --location us-central1
gcloud scheduler jobs resume shetrades-reports-dispatcher-staging --location us-central1
```

## Task 6: Verify before declaring done

- [ ] **Message the bot from a real phone.** Complete onboarding through to a
      lesson. This is the only test that proves the webhook, the database and
      the content pipeline all work together.
- [ ] **Sign in to the dashboard**, open Users, and confirm learner records are
      present and complete.
- [ ] **Issue a test certificate** (manual issue from the Certificates page) and
      open its verification link. This is the check that `PUBLIC_BASE_URL` is
      finally correct — it has never worked in production.
- [ ] **Run a report** and confirm it generates.
- [ ] **Wait one scheduler cycle** (15 minutes) and confirm both jobs ran clean.
- [ ] **Confirm the region** in the console: service and instance both
      africa-south1.

## Task 7: Decommission

Only after 48 hours of clean running.

- [ ] Take a final backup of the old instance and store it per the retention
      policy — which, per the privacy review, still needs to be agreed.
- [ ] Delete the old Cloud Run service.
- [ ] Delete the old Cloud SQL instance.
- [ ] Delete the local dump files.
- [ ] Update `handoff.md`, `docs/backend-deployment-env-matrix.md` and the
      operator handbook's hosting answer.

---

## Rollback

Reversible at every point until Task 7.

| If it fails at | Roll back by |
|---|---|
| Tasks 1–4 | Nothing to undo; the old system never stopped serving |
| Task 5, before the webhook switch | Resume the schedulers. No learner saw anything. |
| Task 5, after the webhook switch | Point the Meta webhook back, restore the `postgres-url` secret to its previous version, revert the Vercel variable, re-point the schedulers. Roughly 10 minutes. |
| Task 6 verification failures | As above. Any learner data written to the new database in the interim must be reconciled by hand — which is why the window should be short and quiet. |

## Cost

The database is the only line that changes materially. Johannesburg carries a
premium over Iowa, Google's cheapest region: expect roughly 30–50% more on an
instance this size, which is tens of dollars a month rather than hundreds.
Cloud Run scales with traffic and stays small either way. Confirm exact figures
in Google's pricing calculator before quoting the client.

Latency improves: Johannesburg is far closer to Nigeria than Iowa, so every
learner message stops crossing the Atlantic twice.

## Hardening worth doing while the service is being recreated

Not required for the migration, but this is the cheapest moment to fix them:

- `ADMIN_CONFIG_JWT_SECRET` and `ADMIN_AUTH_BOOTSTRAP_PASSWORD` are plain
  environment values on the service rather than Secret Manager references. They
  are visible to anyone with console read access.
- The bootstrap admin password is a known default-looking value. Rotate it, and
  disable the bootstrap account once real admin accounts exist.
- The database is `ZONAL`, so a zone failure takes the programme offline until
  Google restores it. Regional availability roughly doubles the database cost;
  a decision for the client, not a default.

## Open decisions for the client

1. africa-south1, or somewhere else in scope for NDPA?
2. Custom domain — yes, and which one?
3. Secrets pinned to the region, or is automatic replication acceptable?
4. Zonal or regional database?
5. What retention period applies to the final backup of the old instance?
