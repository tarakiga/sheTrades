# Backend Deployment Environment Matrix (Cloud Run)

This document defines the runtime environment variables for deploying the backend service on Cloud Run.

## Scope

- Service: `@shetrades/backend`
- Entry endpoints:
  - `GET /health` (liveness)
  - `GET /ready` (dependency readiness)
- Data provider modes:
  - `postgres`
  - `firestore`
  - `hybrid`

## Required Variables

| Variable              | Required In Mode | Default       | Description                                                          |
| --------------------- | ---------------- | ------------- | -------------------------------------------------------------------- |
| `ADMIN_DATA_PROVIDER` | All              | `hybrid`      | Selects provider strategy: `postgres \| firestore \| hybrid`.        |
| `NODE_ENV`            | All              | `development` | Use `production` for strict provider behavior (no fixture fallback). |
| `PUBLIC_BASE_URL`     | All              | none          | Public origin of this service, no trailing slash. **Certificates cannot be issued without it** — see below. |
| `ADMIN_DASHBOARD_URL` | All              | first CORS origin | Origin of the operator console, no path. Used to build the sign-in link in admin invite emails — see below. |

### `ADMIN_DASHBOARD_URL`

The console lives on its own hostname (`admin.shetrades.digital`); the customer
domains serve the public documents and **404 `/login`**. An invite email pointing
at the wrong one sends a new operator to a dead page.

This was never set, so `resolveAdminLoginUrl()` has been falling back to the
first entry in `BACKEND_CORS_ALLOWED_ORIGINS`. Set it explicitly, and keep the
admin host first in the CORS list anyway so the fallback is also correct.

See `docs/public-admin-hostname-split.md` for the full topology and the cutover
order.

### `PUBLIC_BASE_URL`

A certificate reaches a learner as an image URL that **Meta fetches**, plus a
verification link she shares. Neither can be relative, so `certificateUrls()`
throws on an empty value rather than emitting a link WhatsApp cannot resolve.
Leaving this unset does not degrade issuing, it stops it — and it stops it
silently, because the failure only surfaces the first time a learner completes
every module.

That is exactly how it went missing once already: it is read from the
environment, is not in any schema, and nothing at deploy time asks for it.

Set it to the origin only:

```
PUBLIC_BASE_URL: "https://<host>"
```

If the service moves, or gains a custom domain, this changes with it. Note that
certificates already issued keep the link they were issued with — see
`docs/superpowers/plans/2026-08-19-data-residency-migration.md` on why a custom
domain is worth adding before certificates go out at volume.

## Provider Connectivity

| Variable               | Required In Mode      | Default | Description                                            |
| ---------------------- | --------------------- | ------- | ------------------------------------------------------ |
| `POSTGRES_URL`         | `postgres`, `hybrid`  | none    | PostgreSQL connection string for admin provider reads. |
| `FIRESTORE_PROJECT_ID` | `firestore`, `hybrid` | none    | GCP project id for Firestore admin provider reads.     |

## PostgreSQL TLS Controls

| Variable                     | Default | Description                                                                         |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `PG_SSL_ENABLED`             | `true`  | Enables TLS options for PostgreSQL connections.                                     |
| `PG_SSL_REJECT_UNAUTHORIZED` | `true`  | Enforces certificate validation. `false` is blocked when `NODE_ENV=production`.     |
| `PG_SSL_CA_CERT`             | none    | PEM CA certificate content for custom trust chain (supports `\n` escaped newlines). |
| `PG_SSL_CLIENT_CERT`         | none    | Optional PEM client certificate for mTLS PostgreSQL endpoints.                      |
| `PG_SSL_CLIENT_KEY`          | none    | Optional PEM client private key for mTLS PostgreSQL endpoints.                      |

## PostgreSQL Mapping Variables

| Variable                        | Default                    | Description                                                    |
| ------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `PG_ADMIN_USERS_VIEW`           | `admin_users_view`         | Read model for users page table rows.                          |
| `PG_ADMIN_ANALYTICS_TABLE`      | `admin_analytics_snapshot` | Snapshot analytics source when strategy is `snapshot`.         |
| `PG_USERS_TABLE`                | `users`                    | Users base table used by live analytics strategy.              |
| `PG_PROGRESS_TABLE`             | `user_progress`            | Progress table reserved for live analytics strategy expansion. |
| `PG_QUIZ_ATTEMPTS_TABLE`        | `quiz_attempts`            | Quiz attempts table used by live analytics strategy.           |
| `PG_USERS_ID_COLUMN`            | `id`                       | Primary user identifier column in users table.                 |
| `PG_USERS_LOCATION_COLUMN`      | `location`                 | User location/state column used for regional analytics.        |
| `PG_PROGRESS_USER_ID_COLUMN`    | `user_id`                  | User identifier column in progress table.                      |
| `PG_PROGRESS_COMPLETION_COLUMN` | `module_completion_pct`    | Completion percentage column in progress table.                |
| `PG_QUIZ_USER_ID_COLUMN`        | `user_id`                  | User identifier column in quiz attempts table.                 |
| `PG_QUIZ_PASSED_COLUMN`         | `passed`                   | Boolean pass/fail column in quiz attempts table.               |
| `PG_ADMIN_CONTENT_VIEW`         | `admin_content_view`       | Read model for content page table rows.                        |
| `PG_ADMIN_REWARDS_VIEW`         | `admin_rewards_view`       | Read model for rewards page table rows.                        |
| `PG_ADMIN_REPORTS_VIEW`         | `admin_reports_view`       | Read model for reports page table rows.                        |

## Firestore Mapping Variables

| Variable                        | Default           | Description                                                    |
| ------------------------------- | ----------------- | -------------------------------------------------------------- |
| `FS_ADMIN_USERS_COLLECTION`     | `admin_users`     | Users collection for admin page reads.                         |
| `FS_ADMIN_ANALYTICS_COLLECTION` | `admin_analytics` | Analytics collection for admin page reads.                     |
| `FS_ADMIN_ANALYTICS_DOC_ID`     | `latest`          | Analytics document id in analytics collection.                 |
| `FS_LIVE_USERS_COLLECTION`      | `users`           | Live analytics user collection for aggregate counts.           |
| `FS_LIVE_STARTED_FIELD`         | `has_started`     | Boolean field indicating user has started learning flow.       |
| `FS_LIVE_COMPLETED_FIELD`       | `has_completed`   | Boolean field indicating user completed learning flow.         |
| `FS_LIVE_PASSED_FIELD`          | `has_passed`      | Boolean field indicating user has passed quiz criteria.        |
| `FS_LIVE_LOCATION_FIELD`        | `location`        | Location/state field used for regional analytics segmentation. |
| `FS_LOCATION_VALUE_ANAMBRA`     | `Anambra`         | Value in location field representing Anambra cohort.           |
| `FS_LOCATION_VALUE_DELTA`       | `Delta`           | Value in location field representing Delta cohort.             |
| `FS_ADMIN_CONTENT_COLLECTION`   | `admin_content`   | Content collection for admin page reads.                       |
| `FS_ADMIN_REWARDS_COLLECTION`   | `admin_rewards`   | Rewards collection for admin page reads.                       |
| `FS_ADMIN_REPORTS_COLLECTION`   | `admin_reports`   | Reports collection for admin page reads.                       |

## Query and Resiliency Policy

| Variable                     | Default    | Description                                                 |
| ---------------------------- | ---------- | ----------------------------------------------------------- |
| `ADMIN_ANALYTICS_STRATEGY`   | `snapshot` | Analytics query strategy: `snapshot \| live`.               |
| `ADMIN_QUERY_TIMEOUT_MS`     | `3000`     | Query timeout for provider operations and readiness checks. |
| `ADMIN_STATEMENT_TIMEOUT_MS` | `3000`     | PostgreSQL statement timeout (milliseconds).                |
| `ADMIN_CONNECT_TIMEOUT_MS`   | `3000`     | PostgreSQL connection timeout (milliseconds).               |
| `ADMIN_RETRY_ATTEMPTS`       | `2`        | Retry attempts for retryable provider errors.               |
| `ADMIN_RETRY_DELAY_MS`       | `200`      | Delay between retries (milliseconds).                       |

## Test and Diagnostics Controls

| Variable                 | Default | Description                                           |
| ------------------------ | ------- | ----------------------------------------------------- |
| `ADMIN_FORCE_EMPTY_DATA` | `false` | Forces empty fixtures for negative-path testing only. |

## Reports Export Controls

| Variable                       | Default                   | Description                                                     |
| ------------------------------ | ------------------------- | --------------------------------------------------------------- |
| `ADMIN_REPORTS_API_TOKEN`      | `local-dev-reports-token` | Required token for `/api/reports/*` protected endpoints.        |
| `REPORT_EXPORT_RENDER_MODE`    | `mock`                    | Export rendering behavior: `mock \| flaky_once \| always_fail`. |
| `REPORT_EXPORT_RETRY_ATTEMPTS` | `3`                       | Retry attempts for transient export renderer failures.          |
| `REPORT_EXPORT_RETRY_DELAY_MS` | `75`                      | Delay in milliseconds between export renderer retries.          |

## Cloud Run Notes

- Configure secrets for sensitive values (for example `POSTGRES_URL`) using Secret Manager and inject them as env vars.
- Use `GET /health` for liveness and `GET /ready` for readiness in deployment checks.
- In `hybrid` mode, readiness is successful when at least one provider is available.
- In `production`, provider failures surface as errors instead of silently falling back to fixture data.
