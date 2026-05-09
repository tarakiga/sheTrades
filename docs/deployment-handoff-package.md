# Deployment Handoff Package

This document is the final handoff index for release execution.

## Core References

- Product scope: `PRD.md`
- Task execution history: `handoff.md`
- Task index: `docs/task-list.md`
- Ops runbook: `docs/backend-ops-runbook.md`
- Env matrix: `docs/backend-deployment-env-matrix.md`
- Reliability validation: `docs/backend-reliability-validation.md`
- Cutover checklist: `docs/release-cutover-checklist.md`
- Go/No-Go template: `docs/release-go-no-go-template.md`

## Mandatory Commands

```bash
npm run lint
npm run typecheck
npm run test -w @shetrades/backend
npm run smoke:staging -w @shetrades/backend
npm run validate:reliability -w @shetrades/backend
npm run format:check
```

## Required Runtime Signals Before Production

- Staging `/health` = `200`
- Staging `/ready` = `200` with `ok=true`
- Promotion gate workflow success
- No unresolved high-severity alerts from readiness monitor

## Handoff Owners

- Deployment owner:
- Monitoring owner:
- Rollback owner:
- Business signoff owner:

## Final Notes

- Do not proceed without completed `GO` decision record.
- If any critical gate fails, block deployment and follow rollback/incident workflow in `docs/backend-ops-runbook.md`.
