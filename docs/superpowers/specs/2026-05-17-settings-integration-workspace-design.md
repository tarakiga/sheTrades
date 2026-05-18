# Settings Integration Workspace Design

## Goal

Extend `/settings` with a first-class `Integration` workspace that allows admins to manage system integrations through premium managed workspaces instead of hardcoded runtime values.

This workspace should:

- add a new top-level `Integration` tab in `/settings`
- add nested integration provider tabs for `WhatsApp` and `Notification`
- move the settings access key component into the new Integration area
- support full managed draft, publish, history, rollback, and preview workflows
- support connection testing for both providers
- maintain visual and behavioral consistency with the existing premium settings experience

## Approved Direction

- `Integration` becomes a new top-level `/settings` tab beside `Options` and `Legal`
- `Integration` contains nested provider tabs:
  - `WhatsApp`
  - `Notification`
- both providers use full managed workspaces, not one-off forms
- all values, including secrets, are stored and edited directly in `/settings`
- connection testing is part of the integration workspace experience
- the settings access key component moves into the Integration area

## Why

The current product is not compliant with the integration portion of the CORE DIRECTIVE because integration configuration is still tied to direct runtime variables and has no managed admin interface in `/settings`.

The right fix is not a standalone custom page or hidden backend-only setup. The right fix is to bring integrations into the same managed product system as the rest of settings:

- reusable
- versioned
- reviewable
- testable
- publish-controlled
- non-technical where possible

This keeps the design system and managed config platform as the source of truth.

## Scope

This design covers:

- adding a top-level `Integration` tab to `/settings`
- adding nested `WhatsApp` and `Notification` provider tabs
- adding a dedicated config model for integrations
- moving the settings access key component into the Integration workspace
- adding provider-specific managed documents
- supporting draft, publish, rollback, history, preview, and connection testing
- switching runtime integration reads to published managed integration config where applicable

This design does not cover:

- full WhatsApp outbound messaging implementation
- SMTP delivery pipelines for all email use cases
- secret vault integration
- provider callback orchestration
- retry queues or background job infrastructure
- message template management UX

## Information Architecture

### Top-Level `/settings` Tabs

The `/settings` page should present these top-level tabs:

- `Options`
- `Legal`
- `Integration`

### Nested Tabs Inside `Integration`

The `Integration` workspace should present nested provider tabs:

- `WhatsApp`
- `Notification`

### Access Key Placement

The existing settings access key component should move into the Integration workspace and appear above the nested provider area.

This keeps system connection and integration controls in one place instead of mixing them into content or settings foundations that are unrelated to provider setup.

## Config Platform Extensions

### Namespace

Add a new config namespace:

- `integration`

### Document Type

Add a new managed config document type:

- `integration_config`

This should become a first-class type in the config platform alongside:

- `lesson_content`
- `option_set`
- `legal_block`
- `ui_copy`

### Managed Document Keys

The first provider documents should be:

- `integration.whatsapp.primary`
- `integration.notification.smtp`

These are managed documents with normal draft and publish semantics.

## Integration Payload Models

### WhatsApp Integration Payload

Recommended managed payload:

```json
{
  "title": "Primary WhatsApp Integration",
  "provider": "meta_whatsapp_cloud",
  "enabled": true,
  "verifyToken": "replace-with-verify-token",
  "accessToken": "replace-with-access-token",
  "appSecret": "replace-with-app-secret",
  "phoneNumberId": "replace-with-phone-number-id",
  "businessAccountId": "replace-with-business-account-id",
  "webhookPath": "/webhook/whatsapp",
  "apiVersion": "v23.0",
  "notes": "Primary production WhatsApp connection"
}
```

### Notification Integration Payload

Recommended managed payload:

```json
{
  "title": "Primary SMTP Notification Integration",
  "provider": "smtp",
  "enabled": true,
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "username": "replace-with-username",
  "password": "replace-with-password",
  "fromName": "SheTrades",
  "fromEmail": "noreply@example.com",
  "replyToEmail": "support@example.com",
  "notes": "Primary transactional email sender"
}
```

## Security Model

The approved direction for this project is to store and edit all values directly in `/settings`, including sensitive values.

Because of that choice, the workspace must apply stricter controls than normal settings content:

- only `admin` can access the Integration workspace
- secrets must be masked in table rows and preview surfaces by default
- raw values should be revealable only inside protected edit drawers
- audit and version history must remain available for accountability
- publish control must remain explicit so incomplete or incorrect secrets do not go live accidentally

### Masking Rules

The workspace should never expose raw secrets casually in list or table views.

Examples:

- `verifyToken`: show masked
- `accessToken`: show masked
- `appSecret`: show masked
- `password`: show masked

Provider summaries should surface only:

- provider name
- enabled status
- connectivity health
- last updated time
- safe identifiers like `phoneNumberId` or `host`

## UX Model

### Top-Level Integration Workspace

The Integration tab should use the same premium settings structure:

- section header
- workspace card
- table-first review surface
- side-drawer editing
- preview drawer
- workflow feedback
- publish and history support

### Nested Provider Tabs

Inside the Integration workspace, nested tabs should switch between:

- `WhatsApp`
- `Notification`

Each tab should load a provider-specific managed workspace without creating unrelated page-level custom layouts.

### Table-First Review

Each provider tab should remain table-first and non-technical:

- primary column: integration title
- secondary metadata: provider, key, updated time
- status column: draft/live/hidden
- health column: tested / not tested / failed / connected
- action rail: preview, edit, test connection, history, publish, archive

### Edit Surface

Editing should happen in a reusable integration config side drawer.

The drawer should include:

- core details
- provider fields
- notes
- connection test action
- save draft action

The drawer should not publish automatically.

### Preview Surface

Preview should be read-only and should show:

- provider summary
- masked secret values
- endpoint and identity information
- current draft vs published state
- connection testing status summary if available

## Provider-Specific Forms

### WhatsApp Drawer Fields

- title
- enabled
- provider
- verify token
- access token
- app secret
- phone number id
- business account id
- webhook path
- API version
- notes

### Notification Drawer Fields

- title
- enabled
- provider
- host
- port
- secure
- username
- password
- from name
- from email
- reply-to email
- notes

## Connection Testing

### General Rules

Both providers should support a `Test Connection` action in the workspace.

Testing should:

- use the current working drawer values or the current draft values
- validate required fields before testing
- return immediate success or failure feedback
- not publish automatically
- not mutate the live config

### WhatsApp Test Behavior

The test should verify:

- required fields are present
- request authentication works
- the provider endpoint is reachable

A successful test should communicate:

- provider reachable
- credentials accepted
- test timestamp

### Notification Test Behavior

The test should verify:

- SMTP connectivity
- auth success
- TLS mode compatibility

A later enhancement may support sending a safe test email to an admin-entered address, but this pass only requires connection validation.

### Test Result Handling

Connection test results should be shown in the UI as feedback and summarized in the provider workspace.

Recommended result surface:

- `Connected`
- `Connection Failed`
- `Invalid Configuration`
- `Not Tested`

These results should not overwrite the integration payload itself unless a deliberate audit/result model is added later.

## Backend Contracts And APIs

### Config Platform

The config platform should be extended to support:

- namespace: `integration`
- document type: `integration_config`

### Admin CRUD Endpoints

The integration namespace should support the same managed workflow endpoints already used for settings:

- `GET /api/config/admin/integration/documents`
- `POST /api/config/admin/integration/documents`
- `GET /api/config/admin/integration/documents/:key`
- `PUT /api/config/admin/integration/documents/:key/draft`
- `POST /api/config/admin/integration/documents/:key/publish`
- `GET /api/config/admin/integration/documents/:key/history`
- `POST /api/config/admin/integration/documents/:key/rollback`
- `POST /api/config/admin/integration/documents/:key/archive`
- `POST /api/config/admin/integration/documents/:key/reactivate`

### Connection Test Endpoints

Add protected provider test actions:

- `POST /api/integrations/admin/whatsapp/test`
- `POST /api/integrations/admin/notification/test`

Only admins should be allowed to use these endpoints.

## Runtime Integration Resolution

### WhatsApp Runtime

The WhatsApp webhook verification and future provider logic should stop reading direct hardcoded operational values where managed integration config exists.

The runtime should resolve the published WhatsApp integration config from:

- `integration.whatsapp.primary`

This should replace direct reliance on values such as:

- `WHATSAPP_VERIFY_TOKEN`

### Notification Runtime

SMTP notification runtime should resolve from:

- `integration.notification.smtp`

This creates one managed source of truth for notification delivery config.

## Validation Rules

### WhatsApp Validation

Required:

- title
- provider
- verify token
- access token
- phone number id
- webhook path

Optional but recommended:

- app secret
- business account id
- API version
- notes

Validation rules:

- webhook path must start with `/`
- phone number id must be non-empty
- tokens must be non-empty
- disabled integrations may remain unpublished drafts but still must validate before publish

### Notification Validation

Required:

- title
- provider
- host
- port
- username
- password
- from email

Optional:

- from name
- reply-to email
- notes

Validation rules:

- port must be an integer in valid range
- emails must be valid email format
- secure must be boolean
- host must be non-empty

### Publish Gate

Integration configs must not publish if required values are missing or invalid.

## Permissions

Recommended permission model:

- `viewer`
  - cannot access Integration workspace
- `editor`
  - cannot access Integration workspace
- `admin`
  - can access Integration workspace
  - can save drafts
  - can run connection tests
  - can publish and rollback

This is intentionally stricter than normal settings management because the chosen model includes directly managed secrets.

## Component Plan

Build reusable components before page composition:

- `IntegrationWorkspaceShell`
- `IntegrationProviderTabs`
- `IntegrationStatusBadge`
- `IntegrationConfigSummaryCard`
- `IntegrationSecretsField`
- `ConnectionTestPanel`
- `ConnectionTestResultCallout`
- `IntegrationConfigDrawer`

Each component must have isolated preview coverage before it is used in the production `/settings` Integration tab.

## Preview Requirements

Before production use, preview coverage should include:

- top-level Integration workspace
- nested provider tabs
- WhatsApp config drawer
- Notification config drawer
- masked secret field states
- test connection success state
- test connection failure state
- draft vs live status presentation

## Page Composition

After the component layer is ready:

- update `/settings` top-level tabs to include `Integration`
- render the access key component in the Integration workspace header area
- render nested `WhatsApp` and `Notification` tabs inside the Integration tab
- compose each provider tab from the new reusable integration workspace components

Pages must remain thin composition layers only.

## Testing Plan

### Backend

- config contract tests for `integration` namespace and `integration_config`
- admin auth tests for integration namespace routes
- publish validation tests for WhatsApp and Notification payloads
- connection-test endpoint tests
- runtime resolution tests for integration config

### Frontend

- component preview coverage
- nested tab rendering checks
- drawer validation checks
- connection-test feedback states
- access key relocation regression checks

### Product Verification

Live review should confirm:

- `/settings` shows `Integration` beside `Options` and `Legal`
- `Integration` shows nested `WhatsApp` and `Notification` tabs
- access key UI appears in Integration
- both providers support draft, publish, rollback, preview, and history
- connection testing is visible and usable
- masked secrets do not leak in list or preview views

## Risks

The chosen requirement to store and edit secrets directly in `/settings` introduces higher security risk than using external secret storage.

This design mitigates that risk with:

- admin-only access
- masking
- version control
- explicit publish workflow
- audit visibility

But it does not eliminate the risk entirely.

## Recommended Implementation Sequence

1. Extend config contracts and service for `integration` namespace and `integration_config`
2. Add protected admin CRUD and connection-test endpoints
3. Add reusable integration components
4. Add component previews
5. Update `/settings` top-level tabs and compose the Integration workspace
6. Move access key component into Integration
7. Switch WhatsApp runtime verification to published integration config
8. Run diagnostics, typechecks, tests, and handoff updates
