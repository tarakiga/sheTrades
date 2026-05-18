# Analytics, Rewards, And Reports Workspace Redesign

## Goal

Revamp `/analytics`, `/rewards`, and `/reports` so they align with the same premium workspace quality, component-first structure, and product hierarchy already established in `/settings`, `/content`, `/dashboard`, and `/users`.

This redesign should:

- move all three routes onto the same premium workspace language
- preserve route-appropriate content emphasis rather than forcing identical page shapes
- extend the shared workspace system before page composition
- add preview coverage for any new shared layout patterns introduced in this pass
- keep each route as a thin composition layer that renders reusable components only

## Approved Direction

- use the shared premium workspace system already introduced for `/dashboard` and `/users`
- keep `/analytics` insight-led inside that shared system
- keep `/rewards` and `/reports` table-led inside that shared system
- extend shared primitives and preview coverage before composing the routes
- preserve current backend contracts and focus this pass on hierarchy, structure, and premium consistency

## Why

`/settings`, `/content`, `/dashboard`, and `/users` already express the stronger admin product language this platform needs:

- clearer hierarchy
- calmer support content
- stronger primary focus
- better route-to-route consistency
- more intentional premium presentation

By contrast, `/analytics`, `/rewards`, and `/reports` still feel like earlier admin pages with flatter card weighting and less consistent workspace rhythm.

This redesign should close that gap without flattening the distinct role of each route:

- `/analytics` is primarily interpretive
- `/rewards` is primarily operational
- `/reports` is primarily governance/export review

## Scope

This design covers:

- `/analytics`
- `/rewards`
- `/reports`
- shared reusable workspace additions needed to support these routes
- preview coverage for any new shared workspace surfaces used in this pass
- consistent fallback, empty, and support-state handling for the three routes

This design does not cover:

- new backend data sources
- new CRUD workflows or moderation flows
- report scheduling implementation beyond improved presentation of existing states
- reward action flows beyond clearer review structure
- analytics drill-down tools beyond the current data model

## Product Direction

### Workspace Standard

All three routes should move onto the same premium workspace language now used by the newer admin surfaces.

That shared language should keep a stable structural rhythm:

- premium route header
- compact metric strip
- dominant primary surface
- quieter support zone
- clear fallback and empty-state behavior

This keeps the product coherent without making every page identical.

### Route Roles

Each route should keep the content model that best matches its job:

- `/analytics` leads with interpretation and operating signals
- `/rewards` leads with review of the reward log
- `/reports` leads with export governance and history

The shared system should adapt to those needs rather than forcing one generic dashboard layout.

## Shared Workspace Extension

Extend the new workspace system instead of introducing three bespoke page compositions.

Existing shared primitives should remain the foundation:

- `AdminReviewWorkspace`
- `AdminWorkspaceMetricStrip`
- `AdminReviewTableShell`

This pass should add only the missing shared layer needed for analytics:

- a premium insight-led primary-surface pattern that matches the same visual language as the table shell

Suggested responsibility for the analytics-specific shared surface:

- present the strongest analytics signals first
- support grouped insight panels with consistent spacing and hierarchy
- maintain premium framing, elevation, and density consistent with the table-led workspaces
- support empty, fallback, and degraded states without ad hoc route-specific layout code

This keeps the system reusable:

- one workspace shell language
- one metrics language
- one primary-versus-secondary hierarchy
- content-specific variation only where the route genuinely needs it

## `/analytics` Composition

### Role Of The Page

`/analytics` should become an insight-led review workspace rather than a mixed card grid.

It should answer:

- what the strongest performance signals are
- where progression or funnel health needs attention
- whether analytics data is current or degraded

### Recommended Structure

1. Header
   - route title
   - concise interpretive description
   - live/fallback status treatment
   - one restrained route action

2. Summary strip
   - compact top-line metrics only
   - strongest signals first

3. Primary insight surface
   - premium analytics review canvas
   - funnel breakdown
   - progression signals
   - quiz performance highlights
   - sync/health callouts where they materially affect interpretation

4. Secondary support zone
   - realtime status
   - interpretation notes
   - lower-priority operational details
   - calmer fallback messaging

### Hierarchy Rules

- the insight surface must clearly dominate the page
- support content must remain quieter
- signal panels should feel decision-oriented, not decorative
- tabs may remain inside the primary surface if they help organize analysis, but they should no longer define the entire page layout

## `/rewards` Composition

### Role Of The Page

`/rewards` should become a reward-log review workspace with stronger operational hierarchy.

It should answer:

- what reward activity has happened
- which entries are pending or failed
- whether automation and fulfillment look healthy

### Recommended Structure

1. Header
   - route title
   - short operational description
   - live/fallback status treatment
   - one restrained route action

2. Summary strip
   - reward health and fulfillment metrics
   - enough context to orient the table review

3. Primary review surface
   - reward log inside `AdminReviewTableShell`
   - clearer status hierarchy
   - calmer metadata treatment

4. Secondary support zone
   - exceptions
   - delivery gaps
   - automation health
   - empty-state messaging where no issues exist

### Table Direction

The reward log should adopt the same premium review-table language used on `/dashboard` and `/users`:

- tighter rhythm
- stronger title/status hierarchy
- quieter supporting metadata
- cleaner empty states

## `/reports` Composition

### Role Of The Page

`/reports` should become an export-governance workspace with clearer history and support context.

It should answer:

- what exports were generated
- which preset paths exist
- whether scheduled jobs are configured or absent

### Recommended Structure

1. Header
   - route title
   - concise governance-oriented description
   - live/fallback status treatment
   - one restrained route action

2. Summary strip
   - export volume and governance metrics
   - enough context to frame the export history review

3. Primary review surface
   - export history inside `AdminReviewTableShell`
   - strongest review focus on recent output activity

4. Secondary support zone
   - report presets
   - scheduled jobs
   - empty scheduling states
   - explanatory support content

### Support Panel Direction

The presets and scheduling surfaces should still feel premium, but they should no longer compete with export history for top emphasis.

## States And Behavior

Each route should preserve explicit source-state communication:

- `live`
- `fallback`
- degraded-but-safe messaging where appropriate

States should be first-class within the shared system rather than improvised in page files:

- empty states
- loading states
- fallback states
- degraded source notes

The goal is stable layout behavior with no jumpy panel resizing or ad hoc spacing when data is missing.

## Component Plan

Build or extend reusable components before page composition.

Expected shared work:

- extend `AdminReviewWorkspace` only if needed for route-level flexibility
- reuse `AdminWorkspaceMetricStrip`
- reuse `AdminReviewTableShell`
- add one shared analytics insight surface and any small supporting layout primitives it needs
- register all new shared pieces in previews before route usage

Existing primitives should continue to support the work where possible:

- `SectionHeader`
- `Badge`
- `Card`
- `Table`
- `Tabs`
- `EmptyState`
- `LoadingState`
- `StatCard`

Only add new abstractions where the current primitives no longer support the premium workspace structure cleanly.

## Preview Requirement

Any new shared layout or insight-surface component introduced for this redesign must appear in the preview environment before use in `/analytics`, `/rewards`, or `/reports`.

Preview coverage should demonstrate:

- analytics insight-led primary surface
- table-led rewards/reports workspace hierarchy
- support-zone composition
- empty/loading/fallback handling where relevant

## Data And Behavior

This redesign should preserve current backend integration in this pass.

That means:

- continue using existing admin route adapters and contracts
- do not introduce new API dependencies just for this redesign
- improve presentation and hierarchy first

Behavioral improvements that are in scope:

- clearer grouping of existing signals
- stronger distinction between primary review content and support content
- more intentional fallback and source-state communication
- calmer, more consistent support-panel behavior

## Accessibility

The redesign must maintain or improve:

- semantic heading order
- readable table structure
- meaningful labels for insight panels and status messaging
- visible focus states
- clear badge contrast
- screen-reader-safe route actions and tab semantics

## Implementation Order

Build in this order:

1. extend shared workspace primitives only where needed
2. add preview coverage for the new shared analytics/rewards/reports workspace patterns
3. compose `/analytics` on the shared workspace
4. compose `/rewards` on the shared workspace
5. compose `/reports` on the shared workspace
6. run verification and update tracking docs

This order preserves the design-system, component-first, and preview-first rules.

## Testing And Verification

Verification should include:

- dashboard diagnostics on edited files
- `npm run typecheck -w @shetrades/dashboard`
- `npm run build -w @shetrades/dashboard`
- focused UI review of `/analytics`
- focused UI review of `/rewards`
- focused UI review of `/reports`
- preview review for any new shared workspace additions

## Outcome

When complete:

- `/analytics`, `/rewards`, and `/reports` will feel like part of the same premium admin product system as `/settings`, `/content`, `/dashboard`, and `/users`
- analytics will retain an insight-led structure without becoming a generic card grid
- rewards and reports will gain stronger table-led hierarchy without bespoke page-only patterns
- the admin workspace system will expand in a reusable way rather than fragmenting into route-specific layouts
