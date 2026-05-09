# Release Go/No-Go Record

## Release Metadata

- Release date: 2026-05-05
- Candidate revision: local workspace state (post Task 025)
- Environment: staging -> production promotion gate
- Deployment owner: pending assignment
- Approvers: pending assignment

## Gate Summary

- Lint: PASS (`npm run lint`)
- Typecheck: PASS (`npm run typecheck`)
- Tests (`@shetrades/backend`): PASS (`47/47`)
- Reliability validation: PASS (`npm run validate:reliability -w @shetrades/backend`)
- Format check: PASS (`npm run format:check`)
- Staging smoke: FAIL (`npm run smoke:staging -w @shetrades/backend`)
- Failure detail: `[postgres] /ready=503` with postgres reason `unable to verify the first certificate`
- TLS control path: implemented (`PG_SSL_CA_CERT`, `PG_SSL_REJECT_UNAUTHORIZED`) with production-safe guard.

## Risk Review

- Open known risks:
  - Staging readiness is degraded for PostgreSQL provider path due to TLS certificate trust failure.
  - Staging runtime does not yet provide `PG_SSL_CA_CERT` for custom CA trust.
  - Production promotion without readiness recovery violates runbook gates.
- Mitigations in place:
  - Readiness endpoint diagnostics available (`/ready` payload).
  - Rollback criteria/runbook documented in `docs/backend-ops-runbook.md`.
- Rollback owner: pending assignment
- Rollback plan reference: `docs/backend-ops-runbook.md`

## Decision

- Decision: `NO-GO`
- Decision time: 2026-05-05
- Decision owner: AI Coding Agent (preliminary gate decision)
- Notes:
  - Promotion is blocked until staging `/ready` returns `200` with `ok=true`.
  - Re-run smoke flow after provider/config remediation.

## Post-Deploy Verification

- Not applicable (deployment blocked by NO-GO).
