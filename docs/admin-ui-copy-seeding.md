# Admin UI Copy Seeding Guide

This guide publishes the baseline `admin.ui.*` runtime copy keys into the config platform so dashboard/admin labels can be managed without code edits.

## Prerequisites

- Backend API is running (`/api/config/admin/*` reachable).
- `ADMIN_CONFIG_JWT_SECRET` is set to the same value used by the backend runtime.
- Seed file exists:
  - `docs/config-seeds/admin-ui-copy.seed.json`

## Default Seed Command

From repository root:

```bash
npm run seed:admin-ui-copy -w @shetrades/backend
```

Defaults:

- Base URL: `http://localhost:8080`
- Seed file: `docs/config-seeds/admin-ui-copy.seed.json`
- JWT subject: `seed-admin-ui-copy`

## Override Settings

Use environment variables when seeding a different environment or file:

- `ADMIN_UI_COPY_SEED_BASE_URL` (e.g. `https://staging-api.example.com`)
- `ADMIN_UI_COPY_SEED_FILE` (absolute or relative path to custom JSON)
- `ADMIN_UI_COPY_SEED_SUBJECT` (audit subject stored in config actor metadata)
- `ADMIN_CONFIG_JWT_SECRET` (required)

PowerShell example:

```powershell
$env:ADMIN_CONFIG_JWT_SECRET="replace-with-secret"
$env:ADMIN_UI_COPY_SEED_BASE_URL="http://localhost:8080"
npm run seed:admin-ui-copy -w @shetrades/backend
```

## Seed File Contract

JSON array of objects:

```json
[
  {
    "key": "admin.ui.nav.overview",
    "title": "Nav Overview",
    "content": {
      "en": "Overview",
      "pcm": "Overview",
      "ig": "Overview"
    }
  }
]
```

Rules:

- `key` must be unique and follow `admin.ui.*`.
- `title` is the admin document title.
- `content.en` is required.
- `content.pcm` and `content.ig` are optional.
- Legacy `value` is still accepted and mapped to `content.en` for backward compatibility.

## Runtime Behavior

- Script upserts by key in `content` namespace with `ui_copy` type.
- Each entry is updated as draft, then published.
- Existing non-`ui_copy` keys are rejected for safety.

## Verification

- Call `GET /api/config/public/content`.
- Confirm documents include `admin.ui.*` keys.
- Open dashboard admin routes and confirm labels update from published content.
