# Settings Table Density, Hierarchy, And Drawer Footer Refinement

## Goal

Refine the settings management table so it feels more premium, uses horizontal space more efficiently, avoids unnecessary horizontal scrolling, and presents item hierarchy in a clearer enterprise-friendly way.

## Approved Product Direction

- The `Type` column should be removed from the table view.
- `Type` is redundant because the table is already shown inside a dedicated tab for a single content domain.
- `Status` should be merged into the title area and appear under the title.
- The table should not rely on horizontal scrolling for normal use.
- Long titles such as `Welcome Message` should wrap naturally instead of forcing wide rigid columns.
- The drawer footer should get a more intentional premium hierarchy.

## Why This Change

The current premium action rail improved the action density, but the table still carries too much secondary structure for the available width.

Specific issues:

- `Type` repeats information already implied by the current tab
- `Status` uses a full independent column even though it is supporting information
- the table still risks horizontal pressure because too many columns compete for space
- drawer footer actions can be composed with clearer hierarchy

This refinement resolves those issues without removing core workflow capabilities.

## Scope

This design covers:

- table column restructuring for the settings manager
- stronger visual hierarchy inside the title cell
- quieter metadata styling for draft/live values
- reduced need for horizontal scrolling
- improved drawer footer composition

This design does not cover:

- changes to backend contracts
- new workflow features
- changes to row action semantics
- changes to the current drawer content model beyond footer composition and hierarchy

## Recommended Approach

Use the title column as the primary information block and fold supporting item status into that same cell.

Recommended column structure:

1. `Item`
2. `Draft`
3. `Live`
4. `Actions`

This is preferred because:

- it removes the redundant `Type` column
- it gives the title area enough room to wrap
- it creates a more natural scanning hierarchy
- it reduces the chance of horizontal scroll without hiding important version information

## Table Information Hierarchy

### Item Column

The `Item` column becomes the main information block for each row.

It should present:

1. Display title
2. Internal item name
3. Status directly underneath

Visual hierarchy:

- display title: strongest weight and color
- internal item name: smaller and quieter
- status: supportive, restrained badge or status text under the name

This gives each row a single primary anchor for scanning.

### Removed Column

Remove:

- `Type`

Reason:

- the user already knows the domain from the active tab
- repeating `ui_copy`, `option_set`, or `legal_block` in the table adds noise
- that information can remain available in the drawer, where it is still useful

### Draft And Live Columns

Keep:

- `Draft`
- `Live`

But soften them visually:

- quieter text styling
- less visual emphasis than the item title
- compact version labels such as `v4`

These columns remain useful operationally, but they should not compete with the main item identity.

## Horizontal Space Strategy

The table should no longer depend on horizontal scroll in the normal settings workflow.

Implementation direction:

- remove the redundant `Type` column
- allow the `Item` column to grow and wrap naturally
- avoid rigid minimum widths that force overflow
- keep the action rail compact
- keep draft/live columns narrow and predictable

This should make the table usable without side-scrolling in ordinary desktop usage.

## Row Styling Direction

The row should feel more premium and editorial:

- stronger title-first hierarchy
- quieter supporting metadata
- controlled spacing between title, key, and status
- action rail remains compact and aligned
- status should feel informative, not dominant

The result should look like a mature enterprise admin console, not a raw data grid.

## Drawer Footer Composition

The drawer footer should better express action priority.

Recommended hierarchy:

- Primary action: `Edit`
- Secondary action: `View History`
- Destructive or recovery action: `Move To Trash` / `Restore`
- Quiet utility action: `Close`

Composition guidance:

- `Edit` should read as the main forward action
- `Close` should be visually quiet and not compete with editing
- `Move To Trash` should remain clearly distinct
- `Restore` should feel positive and recoverable rather than destructive
- footer spacing should feel intentionally grouped, not like a flat run of equal buttons

## Accessibility

This refinement must preserve:

- readable wrapped titles
- strong contrast between title and supporting metadata
- clear status communication
- no loss of row action accessibility
- drawer footer action clarity and keyboard usability

## Error Handling And Behavior

No workflow behavior changes are introduced by this pass.

The refinement is visual and structural only:

- same row actions
- same drawer behavior
- same draft/live semantics
- same trash/restore flow

## Testing And Validation

### Settings Table

Validate that:

- `Type` is gone from the table
- `Status` appears under title
- long titles wrap cleanly
- table no longer needs horizontal scroll in normal desktop use
- draft/live columns remain readable
- action rail alignment still feels balanced

### Drawer Footer

Validate that:

- `Edit` reads as the clear primary action
- `Close` is quieter
- destructive/recovery actions remain distinct
- footer spacing feels intentional

### Quality Gates

- `npm run lint -w @shetrades/dashboard`
- `npm run typecheck -w @shetrades/dashboard`
- diagnostics clean on touched files

## Risks

- Over-compressing the table could make version data too quiet
- Wrapping titles without column balance could create uneven row height
- Drawer footer hierarchy could become unclear if button styles are not sufficiently distinct

This design mitigates those risks by:

- preserving draft/live as separate columns
- using title/key/status hierarchy rather than hiding information
- keeping a clear primary action in the drawer footer

## Recommended Delivery Sequence

1. Restructure the table columns
2. Merge status into the title cell
3. Remove `Type`
4. Rebalance column widths and wrapping to eliminate normal horizontal scroll
5. Refine draft/live styling
6. Improve drawer footer action hierarchy
7. Validate the full settings experience

## Success Criteria

This work is successful when:

- the settings table reads comfortably without horizontal scrolling in normal desktop use
- `Type` is removed from the table
- title, internal name, and status form a clear hierarchy inside the item cell
- draft/live remain readable but visually quieter
- the drawer footer feels more intentional and premium
