# Admin Login And Profile Design

## Goal

Replace the manual JWT paste workflow with a premium admin sign-in experience and a first-class profile area that match the quality, consistency, and component-first architecture already established in `/settings` and `/content`.

This design should:

- add a dedicated `/login` route for admin sign-in
- add a dedicated `/profile` route for signed-in admins
- replace normal day-to-day use of the manual access-key panel
- add a sidebar profile card with avatar, name, and email that opens `/profile`
- introduce a proper backend admin identity and session model
- keep UI copy and mutable presentation text aligned with the managed config platform
- preserve premium UX, accessibility, and preview-first delivery

## Approved Direction

- authentication uses seeded admin accounts with `email + password`
- the first profile release includes:
  - full name
  - email
  - role
  - last sign-in
  - edit profile
  - change password
  - sign out
- the admin shell adds a profile card in the sidebar with avatar, name, and email
- normal admin access no longer depends on manually pasting JWT tokens
- a development-only recovery path may remain available behind a non-primary flow, but not as the product default

## Why

The current manual JWT token flow is operationally fragile and not acceptable as the normal admin experience for a premium product.

It creates avoidable friction:

- users must generate a token outside the UI
- users must manually paste the token into settings
- the flow is hard to understand for non-technical admins
- there is no true profile or session identity model in the dashboard

The right fix is to promote authentication into a real product capability:

- intentional
- secure
- reusable
- role-aware
- previewed
- documented

This keeps the admin platform coherent and removes a major usability gap.

## Scope

This design covers:

- backend admin user and session foundation
- seeded bootstrap admin account strategy
- login, logout, current-session, profile update, and password-change contracts
- dashboard route guarding and session handling
- premium `/login` page
- premium `/profile` page
- admin shell sidebar profile card
- reusable auth and profile component library
- preview coverage for the new component layer

This design does not cover:

- forgot-password email delivery
- invite management UI
- MFA
- SSO
- session history and device management
- public registration
- admin role self-management

## Product Shape

### `/login`

Add a dedicated standalone admin sign-in page.

This page should:

- be visually premium and calm
- use the same design tokens and component quality as `/settings`
- keep copy concise and non-technical
- validate email and password inline
- provide clear action feedback for loading, success, and failure
- redirect authenticated users away from `/login`

### `/profile`

Add a dedicated admin profile page inside the authenticated admin shell.

This page should include:

- profile summary card with avatar, full name, email, and role
- account details section
- last sign-in metadata
- edit profile form
- password change form
- sign-out action

### Sidebar Profile Card

Add a profile card at the bottom or lower section of the admin sidebar.

The card should show:

- avatar or avatar fallback initials
- full name
- email

The whole card should act as a premium navigation affordance that opens `/profile`.

## Information Architecture

### Routes

Add:

- `/login`
- `/profile`

Continue to treat existing admin routes as protected routes:

- `/dashboard`
- `/users`
- `/analytics`
- `/content`
- `/settings`
- `/rewards`
- `/reports`

### Route Behavior

- unauthenticated users requesting protected admin routes should be redirected to `/login`
- authenticated users requesting `/login` should be redirected to `/dashboard`
- authenticated users should be able to open `/profile` from the sidebar profile card

## Backend Architecture

### Auth Model

Add a proper admin identity layer on the backend rather than continuing to rely on manually generated standalone JWT strings.

The backend should support:

- email/password login
- signed session token issuance
- current-session lookup
- logout
- profile update
- password change

### Session Strategy

Use backend-issued signed session tokens and validate them on each protected request.

The token should resolve to:

- admin user id
- role
- session id
- issued-at
- expiry

Session validation should be centralized so the same identity contract can protect:

- config admin routes
- integration admin routes
- translation admin routes
- future admin routes

### Compatibility

Existing JWT RBAC middleware should evolve rather than be bypassed.

The preferred direction is:

- keep one shared auth middleware layer
- extend it so it can validate the new backend-issued admin session token
- preserve role enforcement through the existing role-check pattern

## Database Schema

The database schema and API contracts must be finalized before UI implementation begins.

### `admin_users`

Recommended model:

```sql
admin_users (
  id uuid primary key,
  email text unique not null,
  full_name text not null,
  password_hash text not null,
  role text not null,
  status text not null,
  avatar_url text null,
  last_login_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

Field notes:

- `role` supports the existing authorization hierarchy such as `viewer`, `editor`, and `admin`
- `status` supports values such as `active` and `disabled`
- `avatar_url` is optional and should fall back to initials when absent

### `admin_sessions`

Recommended model:

```sql
admin_sessions (
  id uuid primary key,
  admin_user_id uuid not null references admin_users(id),
  token_id text unique not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  last_seen_at timestamptz null,
  created_at timestamptz not null
)
```

This enables:

- session expiry
- logout and revocation
- future session-history expansion
- auditability

## Bootstrap Account Strategy

The first admin accounts should be seeded, not self-registered.

Recommended approach:

- provide a bootstrap seed script or migration step that creates initial admins
- source bootstrap credentials from environment variables or secure operator input
- never commit real emails, passwords, or secrets into the repository

Local development should continue to follow the local-only config rules:

- local overrides in `.env.local`
- production/CI secrets outside the repo
- no committed machine-specific admin credentials

## API Contracts

The backend should expose dedicated protected auth endpoints.

### `POST /api/admin/auth/login`

Purpose:

- authenticate email/password and create a session

Request:

```json
{
  "email": "admin@example.com",
  "password": "replace-with-password"
}
```

Success response:

```json
{
  "message": "Sign-in successful.",
  "session": {
    "token": "signed-session-token",
    "expiresAt": "2026-05-18T10:30:00.000Z"
  },
  "user": {
    "id": "usr_123",
    "fullName": "Aisha Yusuf",
    "email": "admin@example.com",
    "role": "admin",
    "avatarUrl": "",
    "lastLoginAt": "2026-05-17T09:10:00.000Z"
  }
}
```

### `POST /api/admin/auth/logout`

Purpose:

- revoke the current session

Response:

```json
{
  "message": "Signed out successfully."
}
```

### `GET /api/admin/auth/me`

Purpose:

- return the authenticated admin session snapshot used by the dashboard shell and profile page

Response:

```json
{
  "user": {
    "id": "usr_123",
    "fullName": "Aisha Yusuf",
    "email": "admin@example.com",
    "role": "admin",
    "avatarUrl": "",
    "lastLoginAt": "2026-05-17T09:10:00.000Z"
  },
  "session": {
    "expiresAt": "2026-05-18T10:30:00.000Z"
  }
}
```

### `PATCH /api/admin/auth/profile`

Purpose:

- update allowed self-service profile fields

Allowed fields:

- `fullName`
- `avatarUrl`

Request:

```json
{
  "fullName": "Aisha Yusuf",
  "avatarUrl": ""
}
```

### `POST /api/admin/auth/change-password`

Purpose:

- rotate the current admin password

Request:

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

### Validation Rules

Apply typed validation on both client and server:

- email format validation
- password minimum length and strength rules
- trimmed profile names
- blocked updates for disabled accounts
- blocked self-service role changes

## Frontend Architecture

### Shared Auth Client

Replace ad hoc token storage with a shared dashboard auth client.

Responsibilities:

- sign in
- sign out
- fetch current session
- persist the session token for the dashboard runtime
- clear invalid or expired sessions

This should become the single auth surface used by:

- route guards
- admin shell
- `/login`
- `/profile`

### Session Storage

The dashboard should store the backend-issued session token in one shared place and expose a small helper API for reading, writing, and clearing it.

This should replace direct manual dependence on `admin_config_jwt` as the primary end-user login flow.

### UI Copy

Auth and profile page labels, helper text, button labels, and error/support copy should follow the managed UI copy strategy used elsewhere in the dashboard.

No mutable auth UI copy should be introduced as random hardcoded page strings when it belongs in the managed copy layer.

## Component Plan

Build reusable components before page composition.

### New Shared Components

- `AuthPageShell`
- `PasswordField`
- `ProfileSidebarCard`
- `ProfileSummaryCard`
- `ProfileDetailsForm`
- `ProfilePasswordForm`
- `AuthStatusBanner`

### Preview Requirement

Each new component must appear in the preview environment before use in production pages.

Preview coverage should include:

- login idle state
- login loading state
- login invalid-credentials state
- profile summary variants with and without avatar
- profile edit success/error states
- password change success/error states
- sidebar profile card states

## UX Model

### Login Page

The login page should feel trustworthy, polished, and simple.

Recommended content blocks:

- page heading
- short reassurance copy
- email field
- password field with show/hide affordance
- primary sign-in CTA
- inline feedback region

Do not overload the page with technical system language.

### Profile Page

The profile page should follow the premium enterprise admin patterns already established:

- strong section hierarchy
- generous spacing
- clear labels
- calm metadata styling
- side-by-side layout only where it improves readability

The page should prioritize:

- identity clarity
- account safety
- straightforward self-service updates

## Security Rules

- passwords must be hashed server-side only
- password hashes must never leave the backend
- session tokens must be signed by the backend
- protected endpoints must require authenticated session context
- self-service profile edits must not allow role elevation
- password change must require current password verification
- disabled users must not be able to sign in

## Rollout Order

Build in this order:

1. database schema and typed contracts
2. backend auth/session foundation
3. reusable auth/profile components
4. component previews
5. page composition for `/login` and `/profile`
6. admin shell profile-card integration and route guards
7. verification, docs, and handoff

## Testing

Add focused tests for:

- login success and failure
- disabled-account rejection
- current-session lookup
- logout and revoked-session rejection
- profile update validation
- password change validation
- protected-route redirect behavior
- component preview rendering for auth/profile components

## Migration Notes

- the existing access-key panel should stop being the primary way admins access the dashboard
- any temporary developer recovery path should be clearly separated from the normal admin UX
- the admin shell should read current-session identity instead of assuming a manual token-only workflow

## Outcome

When this work is complete, admins should be able to:

- sign in with email and password
- navigate the dashboard without manually generating tokens
- view and manage their own profile details
- change their password
- access their profile directly from the sidebar

This closes the current authentication UX gap while keeping the dashboard aligned with the premium, component-first product system.
