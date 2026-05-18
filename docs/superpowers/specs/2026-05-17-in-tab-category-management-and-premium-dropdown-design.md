# In-Tab Category Management And Premium Dropdown

## Goal

Give each `/settings` tab a clear, non-technical way to manage the categories used by the guided internal-name builder, seed each tab with real managed default categories, replace the native browser dropdown with a premium shared dropdown, and fix the drawer focus bug that currently interrupts typing in the slug field.

## Approved Direction

- Add `Manage Categories` directly inside each tab toolbar.
- Store categories as real managed option-set documents.
- Seed each tab with sensible default categories that admins can edit immediately.
- Keep categories editable through a side-drawer workflow.
- Replace the native category dropdown with a premium shared dropdown/listbox component.
- Fix the drawer focus behavior so the slug field does not lose focus while typing.

## Why This Change

The current guided-name builder introduced the right structural model, but there are still three product gaps:

- admins do not have a clear in-context place to manage categories
- the category control still feels like a basic browser dropdown rather than a premium product component
- the slug field loses focus while typing, which breaks trust in the workflow

This design closes those gaps while staying aligned with the managed-config architecture.

## Scope

This design covers:

- in-tab category management entry points
- managed category option-set documents
- seeded default category content
- category management drawer behavior
- premium dropdown/listbox design for the builder
- drawer focus bug fix

This design does not cover:

- generalized taxonomy management outside the settings workspace
- backend schema changes beyond what is already supported by option-set documents
- changing the existing internal-name format rules

## Data Model

Categories should remain managed config data, not frontend constants.

Each namespace gets one managed option-set document:

- `options.settings.content_categories`
- `options.settings.options_categories`
- `options.settings.legal_categories`

Each document uses the existing option-set payload structure:

- `id`
- `value`
- `label`
- `enabled`
- `sortOrder`

These documents are the source of truth for the category dropdown shown in the create drawer.

## Seeded Managed Defaults

The user approved real managed defaults, not UI-only fallback values.

On first setup, the system should create and publish these option-set documents if they do not already exist.

### Content Categories

- `lesson`
- `message`
- `ui`

### Options Categories

- `language`
- `profile`
- `business_sector`

### Legal Categories

- `privacy`
- `terms`
- `marketing`

These are starter values only. Admins must be able to rename, disable, reorder, add, or replace them later.

## Management Entry Point

Each settings tab toolbar should expose two primary actions:

- `Add New`
- `Manage Categories`

`Manage Categories` should sit beside `Add New` so the relationship is obvious:

- categories are configured here
- new items then use those categories here

This is preferable to forcing admins into the `Options` tab to manage categories for unrelated sections.

## Category Management Drawer

The category workflow should open in a side drawer from the current tab.

### Drawer Content

The drawer should show:

- title matched to the current tab, such as `Manage Content Categories`
- a short non-technical description
- current category list
- ability to add a new category
- ability to rename a category
- ability to disable or re-enable a category
- ability to reorder categories

### Interaction Model

The drawer should feel structured and safe:

- existing categories appear as editable rows
- each row shows label, internal value, enabled state, and ordering controls
- adding a category should guide the user toward a valid slug-like value
- disabling a category should remove it from future builder selection without breaking historical documents

### Save Behavior

Saving category changes should update the related managed option-set document:

- save draft first
- allow publish from the drawer or immediately after save, depending on the current role and existing settings workflow standards

The experience should remain consistent with the broader config platform:

- draft and publish states remain visible
- audit trail continues through the existing config versioning system

## Premium Dropdown Component

The current native `<select>` should be replaced with a shared premium dropdown/listbox component inside the design system.

### Requirements

- visually polished trigger surface
- consistent spacing, radius, and shadows from design tokens
- keyboard accessible
- selected-state indicator
- hover, focus, disabled, and open states
- empty-state message when no categories are available
- reusable outside this one workflow

### Behavior

The dropdown should:

- open below the trigger
- show the current selected category or placeholder
- support click and keyboard navigation
- close on selection, outside click, or `Escape`

This component should be previewed in the component preview environment before or alongside production usage.

## Guided Builder Integration

The internal-name builder should continue to work the same way conceptually:

- namespace is read-only
- category comes from managed data
- slug is the only manual field
- full name preview updates live

The difference is that the category control is now a premium shared dropdown instead of a native browser select.

If no categories are available:

- the dropdown should show a clear empty state
- the helper notice should explain what is missing
- the create action should remain blocked

## Focus Bug Fix

The user reported that the slug field loses focus after each letter.

The likely root cause is the drawer focus logic re-running on each render while open.

### Required Fix

Update the shared drawer behavior so automatic focus runs only when the drawer transitions from closed to open, not on every render while it stays open.

### Expected Result

- users can type continuously in the slug field
- focus remains stable inside the active input
- opening the drawer still focuses the first appropriate control
- closing the drawer still restores focus to the trigger

This is a component-foundation fix, not a local workaround.

## Empty And First-Run States

The first-run experience should be supportive and explicit.

If seeded managed category documents are missing or not yet published:

- the system should attempt to create them through the approved seed path
- if that is not yet available in the runtime environment, the UI should explain the missing state cleanly instead of silently failing

The goal is that new environments should not feel broken or incomplete.

## Validation

Category management should validate:

- no empty values
- no duplicate values within the same namespace document
- value format remains lowercase and safe for internal-name assembly
- at least one enabled category remains available before publish if the workspace depends on it

Messaging should remain non-technical and concise.

## Preview Requirement

Because this adds a new shared dropdown component and new category-management patterns, preview coverage is required for:

- premium dropdown component states
- category management drawer state
- guided builder using the premium dropdown

No production use should skip the preview surface.

## Success Criteria

This work is successful when:

- each tab clearly shows where categories are managed
- categories are real managed config data, not temporary code-side fallback data
- new environments start with sensible editable defaults
- the category control feels premium and consistent with the design system
- the slug field no longer loses focus during typing
- non-technical admins can understand and manage the category workflow without leaving their current tab
