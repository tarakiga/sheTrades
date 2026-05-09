# Release Readiness And Production Cutover Checklist (Task 025)

This checklist is the final gate before production promotion for `@shetrades/backend`.

## 1. Pre-Go-Live Readiness

- [ ] `task-list.md` reflects the latest completed task state.
- [ ] `handoff.md` includes the latest verification evidence.
- [ ] Deployment variables match `docs/backend-deployment-env-matrix.md`.
- [ ] Required secrets are present and current:
  - [ ] `POSTGRES_URL`
  - [ ] `FIRESTORE_PROJECT_ID` (if used)
  - [ ] `ADMIN_REPORTS_API_TOKEN`
  - [ ] `STAGING_BACKEND_READY_URL`
  - [ ] `OPS_ALERT_WEBHOOK_URL` (recommended)
- [ ] Provider mode decision is explicit:
  - [ ] `ADMIN_DATA_PROVIDER` = `postgres` | `firestore` | `hybrid`
  - [ ] `ADMIN_ANALYTICS_STRATEGY` = `snapshot` | `live`

## 2. Quality Gates

Run and record outputs:

```bash
npm run lint
npm run typecheck
npm run test -w @shetrades/backend
npm run smoke:staging -w @shetrades/backend
npm run validate:reliability -w @shetrades/backend
npm run format:check
```

- [ ] Lint passed
- [ ] Typecheck passed
- [ ] Backend tests passed
- [ ] Staging smoke passed
- [ ] Reliability validation passed
- [ ] Formatting check passed

## 3. Runtime Readiness Gates

- [ ] Staging `/health` returns `200`.
- [ ] Staging `/ready` returns `200` and payload `ok=true`.
- [ ] Readiness monitor workflow healthy for last 24h.
- [ ] Promotion gate workflow passed on current release candidate.

## 4. Functional Spot Checks

- [ ] Admin endpoints respond with valid shapes:
  - [ ] `/api/admin/users`
  - [ ] `/api/admin/analytics`
  - [ ] `/api/admin/content`
  - [ ] `/api/admin/rewards`
  - [ ] `/api/admin/reports`
- [ ] Reports export auth check verified (`403` without auth headers).
- [ ] Reports export creation path verified (`/api/reports/exports` with auth).
- [ ] Webhook verification path behaves as expected (`/webhook/whatsapp`).

## 5. Rollback Preparedness

- [ ] Previous stable revision identified and tagged.
- [ ] Rollback owner assigned.
- [ ] Rollback trigger thresholds reviewed:
  - [ ] `/ready` remains `503` beyond 5 minutes
  - [ ] `5xx` rate > 2% for 10 minutes
  - [ ] provider data failures not resolved by one config correction
- [ ] On-call and stakeholder alert channels confirmed.

## 6. Cutover Execution

- [ ] Deployment approved in go/no-go record (`docs/release-go-no-go-template.md`).
- [ ] Production promotion completed.
- [ ] Post-deploy `/health` check passed.
- [ ] Post-deploy `/ready` check passed.
- [ ] First-hour monitoring started.

## 7. Post-Cutover Signoff

- [ ] No critical alerts in first 60 minutes.
- [ ] Incident log updated (if any warnings occurred).
- [ ] Final deployment summary posted with:
  - [ ] release revision
  - [ ] deployment timestamp
  - [ ] readiness status
  - [ ] known follow-ups
