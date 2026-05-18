# Content Page Premium Parity With Settings-Backed Drawers

## Goal

Bring the premium, table-first `/settings` content experience to `/content` so the page feels consistent with the rest of the admin product while reusing the same managed content workflows, drawers, and data model.

## Approved Direction

- Give `/content` full premium parity in feel and interaction model.
- Reuse the existing settings-backed content create, edit, preview, publish, rollback, and trash flows.
- Keep `/content` as a content-focused route and language layer, not a second config-management implementation.
- Make `/content` a thin composition layer over the same managed content system used by `/settings?tab=content`.

## Why This Change

The current `/content` page is structurally older than the `/settings` workspace:

- it uses a simpler two-card layout
- the main table does not dominate the page
- the route does not benefit from the premium search, filter, drawer, and action-rail patterns already established in `/settings`

That creates an avoidable experience gap:

- `/settings` feels premium, focused, and operationally clear
- `/content` feels more like a legacy dashboard card page

Because both routes serve content operators, they should feel coherent. The right way to do that is to reuse the approved managed content foundation rather than duplicate it.

## Scope

This design covers:

- `/content` page layout parity with the premium settings workspace
- reuse of settings-backed content drawers from the `/content` route
- content-specific summary, labels, and supporting panel copy
- shared table density, action rail, and filter/search interaction model

This design does not cover:

- building a new standalone content CRUD system
- backend schema changes
- a translation workflow redesign
- duplicating the content manager logic outside the shared config/content workspace foundation

## Product Positioning

`/settings?tab=content` remains the source-of-truth admin settings workspace for managed content data.

`/content` becomes:

- a premium content-operations front door
- optimized for content teams
- backed by the exact same managed content documents and drawer workflows

This gives content operators a dedicated route without splitting the underlying system into two different implementations.

## Reuse Strategy

The content management behavior already exists inside the settings content workspace.

The right architectural move is to extract or compose the reusable content workspace behavior so both routes can use it safely:

- document loading
- content filters
- search state
- preview drawer
- create drawer
- edit drawer
- history/publish/rollback/trash actions

The route-specific pages should stay thin.

### Route Responsibilities

`/settings?tab=content` should remain responsible for:

- multi-domain settings navigation
- tab-level context across content, options, and legal

`/content` should be responsible for:

- content-focused language
- content-specific header framing
- content-operations supporting panel

The shared content workspace layer should be responsible for:

- managed content table
- actions
- drawers
- loading and workflow feedback

## Layout Model

`/content` should adopt the same premium table-first composition principles already approved for `/settings`.

### Primary Surface

The main review table becomes the dominant surface:

- premium header summary
- search and filter toolbar
- dense, readable content table
- right-aligned compact action rail
- preview/edit/trash actions

### Secondary Surface

The secondary panel becomes supportive rather than equal-weight:

- translation queue or content operations status
- empty state when no queue items exist
- concise guidance rather than taking equal visual priority with the main table

This should feel like an operational workspace, not two unrelated cards sharing equal hierarchy.

## Header Design

The page should use a workspace-style header rather than the old generic dashboard card composition.

The header should include:

- content-specific title
- clear non-technical description
- summary chips such as:
  - total items
  - drafts
  - live items
- live/fallback source indicator

This should borrow the premium structure of the settings workspace header while using content-operations language.

## Toolbar Design

The toolbar should mirror the settings workspace pattern:

- primary action to create content
- search field
- filter chips
- concise helper hint

### Filters

The content route should use the same operational filters already proven in settings:

- `All`
- `Draft`
- `Live`
- `Trash`

These filters should be driven by the managed content document state, not by the older simplified lesson list shape.

## Table Design

The table should use the same density and action logic as the premium settings content table.

### Required Columns

- item title
- status
- draft version
- live version
- actions

The item column should combine:

- display title
- internal key
- optional quiet metadata only if needed

### Actions

The row action rail should reuse the premium compact icon-only model:

- preview
- edit
- move to trash
- restore when already in trash

No full-width row buttons should be reintroduced.

## Drawer Model

The route should reuse the existing settings-backed drawers rather than building new ones.

### Create

The primary action opens the existing content create drawer:

- guided internal-name builder
- content templates
- payload editor
- existing content-kind auto-mapping logic

### Preview

The preview action opens the existing read-only drawer:

- item details
- content kind
- status
- draft/live payload preview
- version badges
- edit action

### Edit

The edit action opens the same settings-backed edit drawer:

- save draft
- publish live
- view history
- restore previous
- move to trash / restore

This preserves one operational model across both routes.

## Data Model Direction

The current `/content` page still relies on a simplified `getContentPageData()` shape based on lesson rows.

For premium parity, the page should align with the managed content document model already used by the settings workspace.

That means the primary table should be driven from the content config documents rather than a simplified lesson-only projection.

If a lesson-focused projection is still useful, it should be treated as a derived view layered on top of the shared content workspace data, not as a separate management source.

## Language Strategy

`/content` should feel content-native rather than config-native.

Use content operator language wherever possible:

- `Create Content` or `Create Lesson`
- `Content Kind`
- `Lesson Content`
- `Message Content`
- `Review Content`

Avoid exposing generic config terminology if a clearer content term exists.

## Implementation Shape

The cleanest implementation is to refactor toward a reusable shared content workspace layer.

### Preferred Shape

- extract shared managed content workspace behavior from the current settings content manager
- keep route files thin
- compose route-specific header/supporting content around the shared workspace

### Avoid

- copying `ConfigAdminManager` into a content-only duplicate
- creating a parallel drawer stack for `/content`
- letting `/content` and `/settings` drift in behavior over time

## Error Handling And States

The page should preserve the same safe states as the settings workspace:

- source badge for live/fallback data
- workflow feedback for create/save/publish/restore/trash
- clean empty states
- hydration-safe shared UI behavior

If the backing content service is unavailable, `/content` should remain usable as a premium shell with clear fallback messaging rather than degrading into a broken page.

## Testing And Verification

Verification should confirm:

- `/content` uses the premium workspace structure rather than the old equal-card layout
- content table actions open the existing settings-backed drawers
- create/edit/preview flows behave the same as the settings content tab
- content filters and search behave consistently
- content-specific labels remain non-technical
- no duplicated content-management implementation is introduced
- touched dashboard files remain free of diagnostics and type errors

## Risks

The main risk is trying to force route parity without first extracting enough shared behavior, which could make the code harder to maintain.

That risk is addressed by making reuse an explicit requirement:

- shared behavior moves into shared workspace pieces
- route files stay thin
- content-specific differences remain presentation-level

## Result

After this change, `/content` should feel like a premium dedicated content operations workspace while still being powered by the exact same managed content system and drawer flows already approved in `/settings`.
