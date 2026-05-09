# Backend Operations Runbook

This runbook defines operator actions for provider readiness validation, staging smoke checks, troubleshooting, and rollback decisions.

## Scope

- Service: `@shetrades/backend`
- Runtime probes:
  - `GET /health` (liveness)
  - `GET /ready` (provider readiness)
- Provider modes:
  - `postgres`
  - `firestore`
  - `hybrid`

## Pre-Deploy Checklist

1. Confirm deployment env variables match [backend-deployment-env-matrix.md](./backend-deployment-env-matrix.md).
2. Confirm `ADMIN_DATA_PROVIDER` and `ADMIN_ANALYTICS_STRATEGY` are intentional for the release.
3. Confirm staging credentials/secrets are present for selected providers.
4. Run quality gates:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test -w @shetrades/backend`

## Staging Smoke Flow

Run smoke checks against staging provider data before production promotion.

```bash
npm run smoke:staging -w @shetrades/backend
```

Optional smoke controls:

- `SMOKE_RUN_POSTGRES=true|false` (default `true`)
- `SMOKE_RUN_FIRESTORE=true|false` (default `true`)
- `SMOKE_ANALYTICS_STRATEGY=snapshot|live` (default `live`)
- `SMOKE_REQUIRE_READY=true|false` (default `true`)

Example (PostgreSQL-only smoke):

```bash
SMOKE_RUN_POSTGRES=true SMOKE_RUN_FIRESTORE=false npm run smoke:staging -w @shetrades/backend
```

Expected result:

- Preflight checks confirm required provider env variables are present for selected smoke modes.
- `/ready` returns `200` for selected provider mode(s), when `SMOKE_REQUIRE_READY=true`.
- All Admin endpoints return `200` with valid response shapes:
  - `/api/admin/users`
  - `/api/admin/analytics`
  - `/api/admin/content`
  - `/api/admin/rewards`
  - `/api/admin/reports`

## Reliability Validation Flow

Run non-functional reliability checks before production cutover:

```bash
npm run validate:reliability -w @shetrades/backend
```

Validation includes:

- endpoint latency profiling (p95 gate)
- health uptime probe sampling
- degraded readiness behavior checks
- protected report endpoint access control checks

## CI/CD Promotion Gate

The repository includes a manual promotion workflow:

- Workflow: `.github/workflows/staging-promotion-gate.yml`
- Trigger: `workflow_dispatch`
- Purpose: run provider-backed smoke checks before production promotion.

Dispatch inputs:

- `run_postgres` (`true|false`)
- `run_firestore` (`true|false`)
- `analytics_strategy` (`live|snapshot`)

Required GitHub secrets:

- `POSTGRES_URL`
- `FIRESTORE_PROJECT_ID`
- `STAGING_BACKEND_READY_URL`
- `OPS_ALERT_WEBHOOK_URL` (optional but recommended)

Behavior:

- Runs `npm run smoke:staging -w @shetrades/backend`.
- Verifies deployed staging `/ready` endpoint returns `200` and `ok=true`.
- Sends alert webhook payload if gate fails and `OPS_ALERT_WEBHOOK_URL` is set.

## Readiness Alerting Hooks

The repository includes a readiness monitor workflow:

- Workflow: `.github/workflows/readiness-monitor.yml`
- Triggers:
  - schedule: every 15 minutes
  - manual: `workflow_dispatch`

Required GitHub secrets:

- `STAGING_BACKEND_READY_URL`
- `OPS_ALERT_WEBHOOK_URL` (optional but recommended)

Behavior:

- Probes staging `/ready`.
- Fails run on HTTP != `200` or when payload does not include `ok=true`.
- Sends alert webhook payload on failure when `OPS_ALERT_WEBHOOK_URL` is configured.

## Readiness Troubleshooting

If `/ready` returns `503`, use this flow:

1. Inspect response payload (`mode`, `checks.postgres`, `checks.firestore`).
2. If PostgreSQL is down:
   - Validate `POSTGRES_URL` secret injection and rotation status.
   - Validate TLS trust chain (for example CA/root certificate availability) when readiness reason indicates certificate verification failure.
   - If staging uses a custom CA, set `PG_SSL_CA_CERT` and keep `PG_SSL_REJECT_UNAUTHORIZED=true`.
   - Never set `PG_SSL_REJECT_UNAUTHORIZED=false` in production (blocked by runtime guard).
   - Check network/connectivity constraints.
   - Confirm table/view mappings (`PG_*`) still match deployed schema.
3. If Firestore is down:
   - Validate `FIRESTORE_PROJECT_ID`.
   - Confirm service account IAM permissions.
   - Confirm collection/doc mappings (`FS_*`) still match deployed data layout.
4. Re-run smoke checks for the impacted provider.
5. Block promotion until readiness and smoke pass.

## Rollback Conditions

Trigger rollback if any of the following occurs after deploy:

- `/ready` remains `503` for more than 5 minutes.
- Admin endpoint error rate (`5xx`) exceeds 2% for 10 minutes.
- Live analytics output is malformed (missing rate strings/funnel fields).
- Provider-specific query failures continue after one config correction attempt.

## Rollback Actions

1. Shift traffic back to the previous healthy revision.
2. Set incident status and note failing provider mode.
3. Capture failing `/ready` payload and recent backend logs.
4. Run smoke checks on the rolled-back revision to confirm stability.
5. Open a fix-forward task with:
   - root cause
   - env/schema mismatch details
   - test gaps discovered

## Post-Incident Hardening

- Add/adjust config validation for any missed invalid mapping pattern.
- Add targeted tests for the discovered failure mode.
- Update deployment matrix and this runbook with corrected operational guidance.

## Release Artifacts

Use these documents for final promotion:

- `docs/release-cutover-checklist.md`
- `docs/release-go-no-go-template.md`
- `docs/deployment-handoff-package.md`
