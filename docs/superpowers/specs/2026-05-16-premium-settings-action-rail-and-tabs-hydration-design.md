# Premium Settings Action Rail And Settings Tabs Hydration Hardening

## Goal

Elevate the `Review And Publish Changes` table interactions to a denser, more premium enterprise standard and remove the remaining extension-driven hydration warning from the `/settings` tab links.

## Problem Summary

Two issues remain in the current implementation:

1. The table row actions use full text buttons, which consume too much horizontal space and feel utilitarian rather than premium.
2. Browser extensions are still injecting attributes into the `/settings` tab anchor elements before hydration, causing noisy development warnings in the settings page.

## Approved Product Direction

- The table action pattern should use a compact icon-only action rail by default.
- Each icon action should show a tooltip for clarity.
- The settings experience should feel premium and space-efficient, consistent with Fortune 500 enterprise products.
- The hydration fix should be narrowly targeted to the settings tab links rather than broadening suppression unnecessarily.

## Scope

This design covers:

- a reusable icon-only action button pattern
- a reusable lightweight tooltip treatment for action rails
- premium settings table action rail integration
- related table visual polish for dense enterprise usage
- targeted hydration-warning suppression for the `/settings` tab links

This design does not cover:

- a full icon system overhaul across the app
- a complete settings tabs visual redesign
- a generalized menu/overflow action system
- non-settings hydration suppression beyond the exact tab link nodes

## Recommended Approach

Use a premium compact action rail pattern built on reusable shared UI primitives, then integrate it into the settings table and apply a narrow hydration hardening pass to the settings tab links.

This is preferred because:

- the action rail solves the current space problem directly
- icon-only controls are common in dense enterprise tables when paired with strong tooltips and accessible labels
- the existing table layout can be upgraded without rebuilding the whole management surface
- the hydration issue is isolated to a small number of link nodes and should be solved with equally isolated suppression

## Build Order

This work must continue to respect the existing project rules:

1. Extend or refine the shared component library first
2. Add preview coverage for the new icon-action pattern
3. Integrate the new pattern into the settings table
4. Apply the settings tab hydration hardening
5. Validate the result

## Component Library Refinements

### 1. Icon Action Button Pattern

Add a reusable icon-only action button variant or companion primitive in the shared UI layer.

Required behavior:

- circular or rounded-square compact hit area
- consistent visual states:
  - default
  - hover
  - focus-visible
  - pressed
  - disabled
  - loading
- semantic tones where needed:
  - neutral
  - primary/edit
  - warning/preview if desired
  - danger/trash
- support for `aria-label`
- support for tooltip attachment

Preferred implementation direction:

- keep using the existing `Button` foundation if practical
- add a dedicated icon-only styling mode rather than creating one-off table buttons
- avoid duplicating button logic

### 2. Tooltip Pattern

Add a lightweight tooltip pattern suitable for dense action rails.

Required behavior:

- appears on hover and focus
- supports short labels such as:
  - `Preview`
  - `Edit`
  - `Move To Trash`
  - `Restore`
- visually restrained and token-driven
- does not cause layout shift
- supports keyboard users

Preferred implementation direction:

- keep tooltip scope intentionally small
- it can be a simple shared component or a disciplined attribute/CSS pattern if that remains reusable and maintainable
- avoid over-engineering a full overlay system when only short tooltips are needed right now

### 3. Visual Language For Enterprise Tables

The action rail should feel intentional and premium:

- compact spacing
- low visual noise
- subtle chroma instead of oversized button treatments
- consistent sizing across all row actions
- clear destructive emphasis only where needed

This is not just a button swap. The row should feel more editorial, dense, and polished.

## Component Preview Requirements

Before production use, the preview surface should show:

- icon-only action buttons
  - default
  - hover/focus guidance
  - loading
  - destructive state
- action rail grouping
- tooltips on each action
- a representative settings-row example using content metadata

The preview route remains the approval surface before the settings table uses the pattern.

## Settings Table UX Design

### Action Rail

Replace the current text action buttons in the row action column with a compact icon-only action rail.

Default actions:

- `Preview`
- `Edit`
- `Move To Trash` when item is active
- `Restore` when item is inactive/trashed

Each action must include:

- visible icon-only control
- tooltip text
- `aria-label`
- clear affordance without taking unnecessary width

### Density And Polish

Refine the table presentation so it feels more premium:

- make the action column narrower and more deliberate
- let the title column carry more prominence than secondary metadata
- keep status visuals restrained and legible
- avoid oversized secondary button shapes inside rows

The result should look more like a mature admin console and less like a stack of generic buttons inside cells.

### Drawer And Modal Consistency

The compact action rail only changes the table entry point.

The existing drawer and confirmation modal remain the places where fuller text labels continue to appear:

- drawer footer actions remain text-based
- confirmation modal remains text-based
- tooltip copy mirrors those labels for consistency

This preserves clarity while maximizing table space.

## Hydration Hardening For Settings Tabs

### Problem

The latest warning trace points to the `/settings` page tab links:

- `app/(admin)/settings/page.tsx`
- the rendered `Link` anchors inside the tablist

The injected attributes shown in the trace are extension-driven and not application-authored.

### Recommended Fix

Apply targeted hydration suppression to the settings tab links only.

Implementation guidance:

- keep the existing `Link` structure
- add suppression at the rendered anchor node level exposed by the tab link output
- do not broaden this suppression to unrelated page content

### Why This Scope

- the warning is isolated to the settings tab anchors
- broader suppression would hide unrelated issues unnecessarily
- this keeps the hardening aligned with the earlier targeted extension-mismatch strategy already used elsewhere in the app

## Accessibility

The premium action rail must remain fully accessible:

- every icon-only control must have a meaningful `aria-label`
- tooltip text must match the action meaning clearly
- focus states must remain obvious and token-driven
- hit areas must remain comfortable, not tiny
- destructive actions must be clearly differentiated without relying on color alone

For settings tabs:

- tab semantics must remain intact
- hydration suppression must not break `role="tab"` or `aria-selected`

## Error Handling And Behavior

The new icon rail should preserve current behavior:

- loading state for trash/restore actions
- same underlying click handlers
- same drawer launch behavior
- same edit handoff
- same confirmation flow for trash

No workflow semantics should change. Only the interaction treatment and density should improve.

## Testing And Validation

### Component Level

- preview icon-only action button states
- preview tooltips
- preview grouped action rail

### Settings Page

Validate in `/settings`:

- tooltips appear for row actions
- row actions remain keyboard accessible
- drawer opens correctly from preview action
- edit handoff still works
- trash/restore still works
- action column uses less horizontal space than before

### Hydration Regression Check

- confirm the specific `/settings` tab hydration warning is reduced or eliminated
- ensure tab interactions and active-state visuals still behave normally

### Quality Gates

- `npm run lint -w @shetrades/dashboard`
- `npm run typecheck -w @shetrades/dashboard`
- diagnostics clean on touched files

## Risks

- Icon-only controls can become ambiguous if tooltip and accessibility labels are weak
- Over-styling the action rail could become decorative instead of useful
- Broader hydration suppression could hide real rendering issues

This design mitigates those risks by:

- requiring strong tooltips and `aria-label`s
- keeping the rail compact but restrained
- limiting hydration suppression to the specific settings tab links

## Recommended Delivery Sequence

1. Add shared icon-action styling/pattern
2. Add lightweight tooltip support
3. Add preview coverage for the pattern
4. Replace settings row text buttons with the icon action rail
5. Refine row/action visual density
6. Apply targeted suppression to settings tab links
7. Validate the full settings experience

## Success Criteria

This work is successful when:

- settings row actions consume significantly less width
- the action rail feels polished and premium rather than generic
- admins can still understand every action through tooltips and accessible labels
- no workflow capability is lost
- the `/settings` tab hydration warning is reduced or eliminated without broad suppression elsewhere
