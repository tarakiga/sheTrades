# Release Go/No-Go Record Template

Use this template for final deployment approval.

## Release Metadata

- Release date:
- Candidate revision:
- Environment:
- Deployment owner:
- Approvers:

## Gate Summary

- Lint:
- Typecheck:
- Tests (`@shetrades/backend`):
- Staging smoke:
- Reliability validation:
- Readiness monitor (24h):
- Promotion gate workflow:

## Risk Review

- Open known risks:
- Mitigations in place:
- Rollback owner:
- Rollback plan reference: `docs/backend-ops-runbook.md`

## Decision

- Decision: `GO` | `NO-GO`
- Decision time:
- Decision owner:
- Notes:

## Post-Deploy Verification

- `/health`:
- `/ready`:
- First-hour incident status:
- Follow-up tasks:
