# Guided Settings Workspace Revamp

## Goal

Redesign the `/settings` tab content into a premium, non-technical, table-first workspace where the management table is the main focus, guidance is helpful but lightweight, and all create/edit/preview workflows happen in side drawers instead of inline forms.

## Approved Product Direction

- Use a `Guided workspace` layout pattern.
- Keep the table as the primary surface in each tab.
- Show `All items` by default in every tab.
- Remove the bulky standalone tips card from the tab content.
- Move `Add New`, `Edit`, and `Preview` flows into side drawers.
- Keep the experience premium, reusable, and friendly for non-technical admins.
- Preserve strong visual feedback, motion restraint, and clear visual hierarchy.

## Why This Change

The current settings experience has become functionally capable, but the information hierarchy is still too fragmented:

- the table competes with multiple cards for attention
- the tips section occupies too much space relative to its value
- inline forms reduce focus on the item list
- the current structure feels more like a utility screen than a premium admin workspace

The new direction should make each tab feel like a guided management console:

- the item list is the hero
- actions are obvious
- help appears only when needed
- editing happens without leaving context

## Scope

This design covers:

- the content structure inside each `/settings` tab
- replacement of the current inline create/edit pattern with drawer-based flows
- reusable component structure for the guided workspace
- visual hierarchy for the tab header, action bar, table, and drawers
- premium motion and feedback expectations
- accessibility and testing expectations

This design does not cover:

- backend API contract changes
- new data model changes
- permissions model changes
- public runtime config rendering changes

## Recommended Approach

Adopt a `table-first guided workspace` pattern for each settings tab.

Each tab should have four layers, in this order:

1. Compact intro band
2. Primary action bar
3. Dominant management table
4. Contextual drawers and feedback

This is the preferred approach because it gives non-technical admins one clear focal point while still preserving guidance and safe workflows.

Compared with the current structure, this approach:

- reduces visual competition around the table
- makes the next action easier to understand
- keeps the user anchored in the list while working
- supports premium enterprise polish without becoming intimidating

## Workspace Information Architecture

### 1. Compact Intro Band

Replace the large guidance card with a compact workspace header inside each tab.

It should contain:

- tab title
- one-line plain-language description
- item count or simple status summary

It should not contain:

- long instructional paragraphs
- stacked tips content
- secondary controls that compete with the main action bar

The intro band should feel like orientation, not content.

### 2. Primary Action Bar

Place the action bar directly above the table.

It should contain:

- a primary `Add New` action
- search
- filter controls
- optional quick status filter chips if needed

Behavior expectations:

- `Add New` opens a drawer
- search and filters affect the table immediately
- controls feel lightweight and operational rather than form-heavy

The action bar should visually frame the table as the main working surface.

### 3. Hero Table

The table remains the dominant surface in every tab.

Default content:

- all items in the selected namespace
- title-first hierarchy
- quiet supporting metadata
- compact action rail

The table should support:

- scanning
- filtering
- quick preview
- edit handoff
- trash/restore management

The table must continue to avoid normal horizontal scrolling and should remain visually calmer than a generic data grid.

### 4. Contextual Guidance

Guidance should still exist, but it should no longer live in a large permanent card.

Guidance should appear through:

- concise helper text in the intro band
- empty-state coaching when no items exist
- inline hints near filters or buttons
- supportive text inside drawers

This keeps the workspace helpful without letting guidance dominate the layout.

## Drawer Model

All major workflows should happen in drawers so the user stays anchored to the table.

### Add Drawer

Purpose:

- create a new item without leaving the list context

Contents:

- human-readable title
- internal name
- type-aware content fields
- optional starter templates
- contextual hint copy

Behavior:

- launched from `Add New`
- shows clear save/loading/success/error feedback
- closes on successful create only when that helps continuity
- refreshes and highlights the new row after creation

### Preview Drawer

Purpose:

- inspect the selected item in a read-only format

Contents:

- item summary
- status
- draft/live version details
- recent history summary
- clear `Edit` call to action

Behavior:

- launched from row preview action
- read-only by default
- supports transition into edit flow

### Edit Drawer

Purpose:

- update the selected item in context

Contents:

- editable fields based on namespace/type
- draft actions
- publish-ready guidance
- version awareness

Behavior:

- launched from row edit action or preview drawer
- preserves the current table context
- shows strong success/error/loading feedback
- refreshes the row without disorienting the user

## Reusable Component Strategy

This revamp should follow the existing component-first rule and produce reusable building blocks before tab composition changes.

Recommended reusable pieces:

- `SettingsWorkspaceHeader`
  - compact title, description, item count, and optional small summary
- `SettingsWorkspaceToolbar`
  - primary action, search, filters, and status chips
- `ConfigManagementTable`
  - settings-optimized table composition built on the shared table primitive
- `ConfigEditorDrawer`
  - reusable drawer shell for `Add New` and `Edit`
- `ConfigPreviewDrawer`
  - reusable read-only preview drawer
- `SettingsEmptyState`
  - contextual onboarding empty state for each namespace
- optional `FilterChipGroup`
  - lightweight reusable control if filter chips are introduced

Existing shared primitives that should be reused or extended rather than duplicated:

- `Table`
- `SideDrawer`
- `Button`
- `Input`
- `Badge`
- `IconActionButton`
- `EmptyState`
- `Card` only where still justified

## Component Preview Requirement

Any new reusable UI introduced for this revamp must appear in the component preview surface before production use.

Preview coverage should include:

- workspace header states
- action bar variations
- add drawer
- edit drawer
- preview drawer
- empty state
- search/filter states where relevant

The preview should demonstrate the visual hierarchy and interaction model, not just static markup.

## Content Design Principles

The tab content must remain non-technical.

Use:

- plain labels
- direct action wording
- short explanations
- reassuring workflow language

Avoid:

- engineering jargon
- exposing implementation detail as UI copy
- making users interpret raw system concepts unless necessary

Examples of tone:

- `Add New`
- `Preview`
- `Edit`
- `Move To Trash`
- `Restore`
- `Ready to publish`
- `Saved just now`

Not:

- `Instantiate document`
- `Update payload`
- `Archive entity`
- `Mutate config`

## Visual Hierarchy

The visual hierarchy should follow this order:

1. Tab heading and short descriptor
2. Primary action bar
3. Table rows and item titles
4. Contextual metadata
5. Secondary guidance

Detailed expectations:

- the table should visually outweigh any supporting chrome
- row titles should remain the strongest anchor in the table
- version/status metadata should be quieter than titles
- primary actions should feel obvious without being oversized
- helper text should never dominate the layout

The resulting impression should be premium, calm, and managerial.

## Motion And Feedback

Motion should be polished and restrained.

Recommended motion behaviors:

- drawer slide with soft easing
- subtle row highlight after create/edit/publish
- gentle state transition for filters and search results
- loading indicators inside buttons and drawers
- success confirmation through badge, toast, or inline state

Avoid:

- bouncy or playful motion
- decorative animation disconnected from task completion
- anything that slows frequent admin actions

Feedback requirements:

- every primary action must show loading
- every successful action must show confirmation
- every failed action must clearly explain what happened
- row or table refresh should not feel visually abrupt

## Data And Interaction Model

No backend contract changes are required for this design.

Frontend behavior should:

- continue consuming the existing admin endpoints
- load table content first
- open drawers on demand
- refresh the table after successful create/edit/publish/archive/restore actions
- preserve context such as current tab and filter state

Recommended state-handling behavior:

- the selected row should remain stable after refresh when possible
- newly created items should be visible immediately
- edits should update the affected row without confusing the user
- empty states should guide the user toward `Add New`

## Accessibility

This revamp must preserve and improve accessibility.

Requirements:

- drawer focus management remains intact
- keyboard access for all row actions
- search and filters are fully usable by keyboard
- visible focus states for actions and controls
- status and action meaning should not rely on color alone
- helper text and summaries should remain readable and concise

Non-technical usability is part of accessibility in this workspace.

## Risks

- Too much guidance could make the workspace feel heavy again.
- Too little guidance could make first-time admins feel lost.
- Drawer forms could become overlong if all fields are stacked without hierarchy.
- Rebuilding the structure without shared components could regress maintainability.

This design mitigates those risks by:

- keeping guidance compact and contextual
- preserving the table as the center of gravity
- requiring reusable component boundaries
- using preview-first validation before production use

## Recommended Delivery Sequence

1. Design the reusable workspace components
2. Add preview coverage for the new workspace pieces and drawers
3. Refactor the tab content to the guided workspace structure
4. Move `Add New` into a drawer
5. Move `Edit` into a drawer
6. Keep `Preview` as a dedicated read-only drawer aligned to the new layout
7. Add search/filter layer only if it improves clarity without clutter
8. Validate motion, feedback, and table hierarchy

## Testing And Validation

### UX Validation

Validate that:

- the table is the first clear focal point in each tab
- the removed tips card is not missed because guidance still exists contextually
- `Add New`, `Preview`, and `Edit` are easy to find
- the workspace remains understandable for non-technical admins

### Interaction Validation

Validate that:

- drawers open and close smoothly
- action feedback is visible for every major workflow
- row context remains stable after actions
- table refreshes feel intentional and not disruptive

### Component Validation

Validate that:

- new workspace pieces exist as reusable components
- preview surfaces exist for all new reusable components
- no page-specific one-off UI fragments replace shared component responsibilities

### Quality Gates

- `npm run lint -w @shetrades/dashboard`
- `npm run typecheck -w @shetrades/dashboard`
- diagnostics clean on touched files
- focused QA on `/settings?tab=content`
- focused QA on `/settings?tab=options`
- focused QA on `/settings?tab=legal`

## Success Criteria

This revamp is successful when:

- each settings tab feels like a premium guided workspace rather than a stack of unrelated cards
- the management table is the visual and functional center of the tab
- permanent guidance is lighter, shorter, and better placed
- `Add New`, `Edit`, and `Preview` all happen in drawers
- the experience remains non-technical, accessible, and reusable
- the resulting components are previewed and ready for future extension
