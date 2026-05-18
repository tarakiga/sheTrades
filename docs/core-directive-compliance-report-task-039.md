# CORE DIRECTIVE Compliance Report - Task 039

Date: 2026-05-10
Scope: Absolute repository scope (runtime + previews + component demos + metadata labels)
Result: PASS

## Gate Criteria

- All mutable runtime content/options/policy values are resolved from config platform APIs/services.
- Admin config management surfaces support protected CRUD and publish workflow operations.
- User-facing preview/demo labels are config-key driven (with safe fallback when config is empty).
- Metadata labels are config-key driven.
- Local vs production configuration governance files are present and isolated.
- Quality gates pass (`format:check`, `lint`, `typecheck`, backend tests).

## File-Level Verification

### Runtime Externalization

- `backend/src/whatsapp/handler.ts`
  - Bot prompts and menu copy resolve through `getRuntimeText(...)`.
  - Language labels resolve through config keys (`bot.language.*`).
  - Language option parsing supports config-managed option aliases (`bot.language_options`).
- `backend/src/routes/learning.ts`
  - Automated reward amount resolves through config options policy:
    - `policy.rewards.module_completion_amount`
- `backend/src/content/service.ts`
  - In-code mutable lesson seed content removed from runtime service.
- `backend/src/config-platform/runtime-config.ts`
  - Centralized runtime resolver for content/options/policy values.

### Admin Management UI and Workflows

- `dashboard/components/config/ConfigAdminManager.tsx`
  - Protected session check and CRUD operations via `/api/config/admin/*`.
  - Supports create, draft update, publish, history, rollback, and archive.
- `dashboard/app/(admin)/config/content/page.tsx`
- `dashboard/app/(admin)/config/options/page.tsx`
- `dashboard/app/(admin)/config/legal/page.tsx`
  - Config pages now compose the protected manager surface.

### Component/Preview/Metadata Coverage

- `dashboard/app/previews/components/page.tsx`
  - User-visible labels and sample option labels resolve through `t(key, fallback)`.
- `dashboard/app/page.tsx`
  - Design-token page labels resolve through `t(key, fallback)`.
- `dashboard/app/layout.tsx`
  - `generateMetadata()` resolves title/description from published config keys.

### Governance

- `.env.example` exists and is placeholder-only.
- `docker-compose.yml` baseline exists.
- `docker-compose.local.yml` local override exists.
- `.gitignore` retains local/secret protection patterns.

## Allowed Fallback Policy

Safe in-code fallback strings remain intentionally for resilience when config is unpopulated, aligned with rule:
"render sensible, safe defaults without breaking the UI or throwing errors."

These fallbacks are not treated as compliance blockers because runtime always prefers config-managed values first.

## Quality Gate Evidence

- `npm run format:check` -> PASS
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test -w @shetrades/backend` -> PASS (`63/63`)

## Final Decision

PASS for absolute-scope compliance under the approved fallback resilience policy.
