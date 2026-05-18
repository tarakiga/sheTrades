# Settings Table Management, Preview Drawer, And Safe Trash Flow

## Goal

Improve the `Review And Publish Changes` experience so non-technical admins can inspect and manage items directly from the table without sacrificing safety.

## Approved Product Decisions

- Table items should be manageable from the table area.
- Delete should not be a hard delete.
- Delete should behave as a safer `Move To Trash / Remove` action.
- Destructive removal must show a warning and require explicit confirmation in a modal.
- Each item should support a side drawer preview.
- The side drawer should be read-only and include an `Edit` button.

## Why This Change

The current table is useful for status scanning, but it is not yet a true management surface. Non-technical admins need to:

- inspect an item before acting on it
- understand its current state clearly
- edit with confidence from one clear editing surface
- remove items safely without permanent data loss

This change adds those capabilities while keeping the existing draft/publish workflow intact.

## Scope

This design covers:

- row-level management actions in the settings table
- a reusable read-only side drawer preview pattern
- a reusable confirmation modal for safe trash actions
- wiring the drawer and row actions into the settings manager
- safe restore behavior for trashed items

This design does not include:

- permanent hard-delete behavior
- inline table editing
- editing directly inside the drawer
- new page routes outside `/settings`

## Recommended Approach

Use a two-layer management model:

1. Table row actions for quick access to item operations
2. A read-only side drawer for preview and decision-making

This is preferred over inline editing because:

- the content payloads can be large and structured
- inline editing would crowd the table
- non-technical admins benefit from a preview-first flow
- the app already has an existing editor area that should remain the single editing surface

## Build Order

This work must follow the project rules:

1. Extend the component library first
2. Add preview surfaces for every new component
3. Integrate the new components into the settings page
4. Validate backend/API support where needed
5. Test the full workflow

## Component Library Additions

### 1. Side Drawer

Create a reusable `SideDrawer` component in the shared dashboard component library.

Required behavior:

- opens from the right side
- supports title, subtitle, content area, and footer actions
- supports close button and overlay click handling
- traps focus while open
- supports keyboard close with `Esc`
- supports responsive width tokens
- supports loading and empty states if needed later

Required API direction:

- `open`
- `title`
- `description`
- `onClose`
- `children`
- `footerActions`
- optional size variant

### 2. Confirmation Modal

Create a reusable confirmation modal component for warning-based actions.

Required behavior:

- displays warning title and explanation
- includes confirm and cancel actions
- supports destructive visual emphasis
- disables confirm while request is in progress
- preserves focus and restores focus on close

Required API direction:

- `open`
- `title`
- `description`
- `confirmLabel`
- `cancelLabel`
- `tone`
- `loading`
- `onConfirm`
- `onCancel`

### 3. Table Row Actions Pattern

Extend the existing table usage pattern so rows can render a consistent action column without rewriting table structure page by page.

Recommended direction:

- use the existing `Table` component render hooks
- add an `Actions` column in the settings manager
- avoid introducing a second table abstraction unless reuse clearly expands later

## Component Preview Requirements

Before production use, add preview coverage for:

- `SideDrawer`
  - closed/open
  - long content
  - footer actions
  - keyboard/focus behavior notes
- `ConfirmationModal`
  - default warning state
  - destructive confirm state
  - loading confirm state
- settings row action examples using representative content metadata

The preview route remains the approval surface before integration into `/settings`.

## Settings Manager UX Design

### Table Changes

Add a new row action column to `Review And Publish Changes`.

Each row should expose:

- `Preview`
- `Edit`
- `Move To Trash` when item is active
- `Restore` when item is trashed/hidden

Optional future actions such as `View History` can remain in the main workflow area for now if space becomes tight.

### Drawer Content

When a user clicks `Preview`, open a read-only side drawer showing:

- internal name
- display title
- namespace
- item type
- current visibility/status
- last updated time
- draft version number if present
- live version number if present
- draft payload preview
- live payload preview if available
- short version/history summary

The payload display should be read-only and easy to scan. It should not allow editing inline.

### Drawer Actions

The drawer footer should include:

- `Edit`
- `View History`
- `Move To Trash` or `Restore`, depending on status
- `Close`

`Edit` behavior:

- closes the drawer
- selects the item in the existing main editor
- populates the draft editor inputs with the item’s working payload
- scrolls or focuses the main edit area if practical

This preserves a single editing surface and avoids duplicated editing logic.

### Safe Trash Flow

Replace the mental model of `Hide Item` with clearer language:

- `Move To Trash`
- `Restore`

Behavior for `Move To Trash`:

- opens a confirmation modal
- warns that the item will be removed from active use
- explains that history is preserved
- requires explicit confirm action
- does not permanently delete the item

Behavior for `Restore`:

- restores the item from trashed/inactive state
- returns it to a usable visible state
- gives clear success feedback in the workflow area

## Data And State Model

The current archive/reactivate backend model is close to the needed behavior.

Recommended product-facing interpretation:

- active item -> available for normal use
- trashed item -> removed from active use but recoverable

Implementation guidance:

- backend may continue using archive/reactivate semantics internally
- UI copy should prefer `Move To Trash` and `Restore`
- if contract clarity becomes a problem, add a more explicit display state mapping in the admin response layer rather than exposing internal language directly

## Backend Impact

Minimum backend expectation:

- reuse existing archive endpoint for `Move To Trash`
- reuse existing reactivate endpoint for `Restore`
- ensure list responses expose enough state for row actions and drawer status
- ensure future item-detail preview data can be sourced without extra fragile client logic

Optional enhancement:

- add a dedicated document detail endpoint for richer drawer data if the existing list payload becomes insufficient

This should be evaluated during implementation after checking whether current list payloads already provide enough metadata.

## Content And Language

All new admin copy should remain non-technical and action-oriented.

Preferred labels:

- `Preview`
- `Edit`
- `Move To Trash`
- `Restore`
- `This will remove the item from active use. You can restore it later.`

Avoid labels such as:

- `Archive`
- `Reactivate`
- `Soft Delete`

These are implementation terms, not user-facing terms.

## Accessibility

The drawer and confirmation modal must:

- trap focus while open
- support keyboard navigation
- restore focus to the triggering control on close
- provide descriptive titles and action labels
- clearly communicate destructive actions
- maintain readable payload presentation with adequate contrast and spacing

## Error Handling

The new management interactions should preserve the current visible feedback standard:

- action loading state on buttons
- inline success/error feedback in the management area
- clear confirmation text before trashing
- clear restore success feedback

If an action fails from the drawer:

- keep the drawer open
- show the error inline
- do not silently close or discard context

## Testing And Validation

### Component Level

- preview `SideDrawer`
- preview `ConfirmationModal`
- verify accessibility interactions manually

### Settings Workflow

Validate across `Content`, `Options`, and `Legal`:

- preview from table row
- edit from drawer into main editor
- move item to trash with confirmation
- restore trashed item
- publish flow still works after preview/edit/trash interactions

### Regression Checks

- table remains readable on smaller screens
- management card still spans 2 columns on larger screens
- no hydration or accessibility regressions from the new overlay components

## Risks

- Adding too many row actions could crowd smaller screens
- Duplicating edit logic between drawer and main editor would create maintenance risk
- Using backend/internal language in the UI would confuse non-technical admins

This design avoids those risks by:

- keeping the drawer read-only
- routing edits back to the existing editor
- using safe product-facing copy

## Recommended Delivery Sequence

1. Build `SideDrawer` component
2. Build `ConfirmationModal` component
3. Add preview coverage for both
4. Add row action column to the settings table
5. Add preview drawer wiring
6. Add `Edit` handoff into the existing workflow editor
7. Replace `Hide Item` wording/behavior with `Move To Trash` and `Restore`
8. Validate the full workflow across all namespaces

## Success Criteria

This work is successful when:

- admins can preview any table item in a read-only drawer
- admins can jump from preview to the main edit flow with one click
- admins can safely remove items from active use with confirmation
- admins can restore removed items
- the workflow remains understandable for non-technical users
- all new UI is built as reusable components and previewed before production use
