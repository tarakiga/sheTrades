# Backend Reliability Validation (Task 024)

This document captures the non-functional reliability validation approach for the backend service.

## Scope

- Service: `@shetrades/backend`
- Validation dimensions:
  - performance (endpoint latency profile)
  - uptime (health endpoint stability)
  - operational readiness (expected degraded readiness behavior)
  - access control (report export endpoint protection)

## Command

```bash
npm run validate:reliability -w @shetrades/backend
```

Optional tuning variables:

- `RELIABILITY_P95_THRESHOLD_MS` (default `250`)
- `RELIABILITY_UPTIME_SAMPLE_SIZE` (default `100`)
- `RELIABILITY_LATENCY_SAMPLE_SIZE` (default `20`)

## Validation Checks

1. Latency profile
   - samples:
     - `GET /health`
     - `GET /api/admin/users`
     - `GET /api/content/lessons`
     - `GET /api/reports/schemas` (authorized)
   - quality gate:
     - p95 latency for each endpoint must be <= threshold.

2. Uptime probe
   - performs repeated `GET /health` calls.
   - quality gate:
     - no non-200 responses.

3. Operational readiness
   - validates expected `503` behavior when providers are unavailable:
     - `ADMIN_DATA_PROVIDER=hybrid` with no providers configured.
     - `ADMIN_DATA_PROVIDER=postgres` with unreachable `POSTGRES_URL`.
   - validates controlled fallback behavior:
     - `ADMIN_FORCE_EMPTY_DATA=true` keeps admin endpoints operational.

4. Access control
   - validates `GET /api/reports/schemas` rejects unauthorized requests (`403`).

## Last Recorded Result

- Date: 2026-05-05
- Command status: passed
- Notes:
  - all reliability checks completed successfully.
  - no diagnostics errors after implementation.
