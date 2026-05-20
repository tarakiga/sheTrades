## Data-Driven UI & Dynamic Configuration Architecture
Do NOT hardcode any values that may change in the future. All dynamic content, selectable options, UI labels, and configuration strings must be externalized and fully manageable via a dedicated UI management interface. Assume every array, string, or option will change; design for zero-code updates.

## Architecture & Data Flow
- Store all changeable values in a database or config service. Never place them in code, constants, templates, or frontend files.
- Keep content/config completely separate from application logic. Business logic must only consume structured data, never reference specific dropdown values or text strings directly.
- Frontend components must render dynamically from API responses at runtime (or build-time if pre-rendering). Never import static arrays or strings.

## Admin Management Interface
Provide a secure, role-gated management UI where authorized users can:
- Add, edit, disable, or reorder dropdown/options
- Update consent/legal/marketing text via a rich text editor
- View version history, last modified timestamps, and editor attribution
- Preview changes in a draft state before publishing
- Implement a strict draft/published workflow for compliance-sensitive content with full audit trails and rollback capability

## API & Integration Contracts
- Expose a read-only public API for frontend consumption (optimized for performance & caching)
- Expose protected CRUD endpoints for the admin UI with authentication & role-based authorization
- Enforce consistent, well-typed data contracts (e.g., Zod/JSON Schema) validated on both client and server
- Implement client-side caching (e.g., React Query/SWR) with version tags or cache-busting to refresh data immediately after publishing

## Validation, Fallbacks & Safety
- Validate all inputs server-side: length, format, duplicates, empty states. Prevent publishing invalid or empty configurations.
- If the management system is unpopulated, render sensible, safe defaults without breaking the UI or throwing errors.
- Log all config changes with updated_by, updated_at, and version for compliance and debugging.

## DELIVERABLES REQUIRED
Please implement and output ("Output the database schema and API contracts before writing UI code."):
- Database schema/data models for configurable options and legal/content blocks
- Backend CRUD + read-only endpoints with auth guards, validation, and audit logging
- Admin management UI featuring draft/publish workflow, version history, rich text editing, and option management
- Frontend components that consume data dynamically via the API
- Post-deployment documentation: step-by-step guide on how admins add/edit/publish content, manage permissions, handle rollbacks, and troubleshoot caching

### Project tracking
create a task-list.md file in te project root for tracking the progress on the project and a handoff.md file to log progress after each task is complete so any other agent can understand and pick up from where ever you left off incase you don't finish the project

## General Principles
1. Treat the design system and component library as the single source of truth for all UI and UX decisions (colors, typography, spacing, states, and component structure).
2. Never hardcode ad hoc styles or one-off UI elements inside pages or features; everything must be expressed via design tokens and reusable components.

## Design System \& Tokens Rules
3. Before implementing any feature, the agent MUST first define or extend the design system layer:
    - Color tokens (primary, secondary, semantic, backgrounds, borders).
    - Typography tokens (font families, font sizes, weights, line-heights).
    - Spacing and sizing scale.
    - Radii, shadows, and breakpoints.
4. All styling in components and pages MUST be expressed using these tokens (via variables, theme objects, or utility abstractions). No raw hex colors, pixel values, or arbitrary font declarations are allowed outside the token layer.
5. Any new visual primitive (e.g., a new semantic color, spacing size, or typography style) must be added to the design tokens first, then consumed by components. It is forbidden to introduce visual primitives directly in component CSS/JSX without tokenizing them.

## Component Library \& Reusability Rules
6. All UI must be built from a centralized component library (atoms, molecules, organisms), not from page-specific, inline components.
7. The agent MUST create or use an existing reusable component for any UI pattern that appears more than once (e.g., buttons, inputs, tables, status badges, cards, modals, page headers, tabs).
8. If the required component does not exist, the agent MUST:
a. Define its API (props, states, variants) based on the design system.
b. Implement it inside the shared component library folder.
c. Add it to the component preview/documentation system.
d. Only then use it in feature/page code.
9. No page or feature file is allowed to contain “one-off” UI components that duplicate existing library behavior. Any deviation must go through a “new or extended component” in the library.
10. All components must be built to a premium enterprise standard:
    - Fully controlled focus states and hover states.
    - Responsive behavior defined via design tokens and breakpoints.
    - Accessibility in mind (semantically correct tags, ARIA attributes where needed, color contrast).

## Component Preview \& Documentation Rules
11. The project MUST include a dedicated component preview / workshop environment (e.g., Storybook or equivalent) where every component is rendered in isolation.
12. For every component in the library, the agent MUST:
    - Add at least one documented example/“story” per main variant (primary/secondary, sizes, states).
    - Show interactive props (knobs/controls) where feasible.
    - Ensure the preview is the reference place to inspect look, behavior, and API.
13. No component is considered “ready for use” until it appears correctly in the preview environment with basic documentation (name, purpose, props, usage notes).

## Page Composition Rules
14. Pages MUST be composed only from the component library plus layout primitives (grids, stacks, page shells). No page-specific CSS frameworks or random HTML structures are allowed.
15. If a layout pattern (e.g., dashboard shell, two-column form, wizard) is used more than once, it must be factored into a reusable layout component and documented like any other component.
16. Any new page work starts with identifying the required components and layout patterns; if something is missing, add it to the library first, then compose the page from those building blocks.

## Code Quality \& Governance Rules
17. Component APIs must be stable and intentionally designed: clear, typed props; explicit variant props (e.g., `variant="primary" | "secondary"`), and consistent naming across the library.
18. Breaking changes to shared components must follow a migration pattern (e.g., deprecation period, or versioned exports) rather than silently altering behavior that could break multiple pages.
19. All components should be unit-tested or snapshot-tested in isolation, especially for critical UI like buttons, inputs, modals, and navigation.

## Local vs Production Configuration Rules (.env)
20. The agent MUST NOT commit real environment variables or secrets to the repository.
21. The agent MUST define a pattern for environment files such as:
    - `.env.example` (tracked; contains placeholders and structure).
    - `.env.local` (untracked; developer’s local overrides).
    - `.env` (if used for production or CI, managed via deployment pipeline, not committed with secrets).
22. `.gitignore` MUST include local-only environment files such as `.env.local`, `.env.development`, or any file you choose for local overrides so they never get committed.
23. Application config code MUST load local env overrides only when running locally (e.g., via tooling or a specific `NODE_ENV`), and treat those files as optional: the app must still boot without them in production/CI.

## Local vs Production `docker-compose` Rules
24. The base `docker-compose.yml` should describe the production-like or shared baseline configuration.
25. For local development, the agent MUST create an override file such as `docker-compose.override.yml` or `docker-compose.local.yml` that:
    - Overrides ports, volumes, and debugging flags for local use.
    - Uses local-friendly images/commands (e.g., hot reload, code mounts).
    - Can define local environment variables pointing at dev services.
26. The local override compose file MUST be excluded from version control using `.gitignore` if it contains developer-specific or secret information (or use a `*.local.yml` pattern).
27. The instructions for developers must be:
    - Production/CI: `docker compose -f docker-compose.yml up`.
    - Local: `docker compose -f docker-compose.yml -f docker-compose.local.yml up` (or rely on the default `docker-compose.override.yml` behavior), ensuring local overrides never affect production.
28. Under no circumstances may the agent modify the production `docker-compose.yml` to embed localhost-specific settings, debug flags, or developer-specific volumes. All such changes belong only in the local override file.

## Git Hygiene Rules
29. All local-only configuration artifacts must be ignored by git:
    - Local env files (e.g., `.env.local`, `*.local.env`).
    - Local docker compose overrides (e.g., `docker-compose.override.yml` if per-developer, or `docker-compose.local.yml`).
30. Before generating any new config file intended to stay local-only, the agent MUST also update `.gitignore` to include it.
31. The agent MUST NOT remove `.gitignore` entries that protect secrets, local configs, or override files, nor generate code that expects them to be tracked.

