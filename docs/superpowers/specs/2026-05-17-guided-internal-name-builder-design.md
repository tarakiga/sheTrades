# Guided Internal Name Builder

## Goal

Replace the free-text `Internal Name` input in the `Add New` drawer with a guided, non-technical builder that reduces typos, teaches the naming structure, and keeps internal keys consistent across admins.

## Approved Direction

- Use a guided builder only for `new items`.
- Keep existing internal names read-only during edit.
- Show the namespace as read-only based on the active tab.
- Make the middle naming segment a dropdown.
- Make the final naming segment the only manual entry.
- Add a helper note under the field explaining what the internal name is in non-technical language.
- Add namespace-specific examples.
- Add a live preview of the full assembled internal name.
- Add a helper notification when required dropdown fields are empty or not yet available.

## Why This Change

The current free-text internal-name field is valid for technical operators, but it is too open-ended for non-technical admins:

- people have to guess the correct naming structure
- typos in the structural parts are easy to make
- inconsistent naming becomes likely across admins
- the field teaches nothing about the system model

The guided builder solves that by turning the internal name into a structured workflow instead of a blank technical text box.

## Scope

This design covers:

- the `Add New` drawer experience in `/settings`
- guided construction of internal names for new items
- helper copy and empty-dropdown notification behavior
- runtime assembly of the final key used in create requests

This design does not cover:

- editing existing keys
- migration or cleanup of previously created keys
- backend key format rule changes
- full admin tooling for creating category dropdown values

## Builder Structure

The new internal-name builder should be made of three parts:

1. `Namespace`
2. `Category`
3. `Name`

The full internal name is assembled as:

`namespace.category.slug`

### Namespace

- Read-only
- Derived from the current tab
- Not manually editable

Examples:

- `content`
- `options`
- `legal`

This removes one major source of inconsistency and makes the field feel safer.

### Category

- Selectable dropdown
- Represents the middle structural grouping
- Must be populated before the item can be created

Examples by namespace:

- `content`: `lesson`, `message`, `ui`
- `options`: `language`, `profile`, `business_sector`
- `legal`: `privacy`, `terms`, `marketing`

This dropdown should not be hardcoded long-term. It should come from managed configuration data so it can evolve without code changes.

### Name

- Manual input
- Represents the final specific item name or slug
- This is the only part the admin types directly

Examples:

- `onboarding`
- `welcome`
- `consent_notice`

The field should validate and normalize toward the existing backend-safe format:

- lowercase
- numbers allowed
- `.`, `_`, and `-` allowed
- no spaces

## Create Vs Edit Behavior

### Create Drawer

Use the guided builder for all new items.

Admins should see:

- read-only namespace prefix
- category dropdown
- slug input
- helper note
- examples
- live preview of the final internal name

### Edit Drawer

Existing internal names remain read-only.

Why:

- internal keys are long-term identifiers
- changing them later can create operational risk
- the user explicitly approved builder support for new items only

The edit drawer can still display the existing key, but it should not expose the structured builder for key changes.

## Helper Content

### Non-Technical Helper Note

Show a short note directly under the internal-name area.

Recommended copy:

`This is the system name used to organize this item. We build most of it for you to keep it consistent.`

This explanation should be calm, short, and non-technical.

### Namespace-Specific Examples

Show examples matched to the current tab.

Examples:

- Content example: `content.lesson.onboarding`
- Options example: `options.language.supported`
- Legal example: `legal.privacy.notice`

These examples should appear as orientation, not as long instructional text.

### Live Preview

Show a live preview once enough information exists to build it.

Example:

`Full internal name: content.lesson.onboarding`

This preview should update instantly as the user changes the dropdown and slug.

## Empty Dropdown Notification

The user requested a helper notification when dropdown fields are empty.

This should cover two related states:

### 1. No Category Selected Yet

When the dropdown has options but the user has not chosen one yet:

- show a gentle helper message
- do not treat it like an error until save is attempted

Recommended copy:

`Choose a category to finish building the internal name.`

### 2. No Categories Available

When the dropdown has no available options:

- show a more explicit helper notification
- explain why the user cannot continue
- point them toward the dependency clearly

Recommended copy:

`No categories are available yet for this section. Add the category choices first, then come back to create this item.`

This state is especially important because the user wants category values created before content items rely on them.

## UX Behavior

The internal-name builder should feel like one guided field, not three disconnected controls.

Recommended layout:

- one small label area for `Internal Name`
- segmented builder row:
  - namespace chip or locked field
  - category dropdown
  - slug input
- helper note below
- examples below that
- live preview below that
- helper notification when category state is incomplete

The visual tone should feel premium and instructional, not form-heavy or technical.

## Validation Rules

### Builder Completion

The create action should be blocked if:

- category is not selected
- slug is empty
- slug contains invalid characters

### Validation Messaging

Messages should remain non-technical.

Examples:

- `Choose a category first.`
- `Add a short name for this item.`
- `Use only lowercase letters, numbers, dots, dashes, or underscores.`

### Final Key Assembly

The final value sent to the backend should be assembled from:

- namespace
- selected category
- validated slug

Result:

`namespace.category.slug`

## Data Dependency

The category dropdown should be treated as managed data, not hardcoded page data.

Recommended source:

- namespace-specific config-managed option sets

Examples:

- content category options
- options category options
- legal category options

If these option sets are not available yet, the UI should fall back to the empty-dropdown helper state rather than silently failing or leaving the user confused.

## Accessibility

Requirements:

- namespace value remains readable and clearly marked as locked/read-only
- category dropdown is keyboard accessible
- helper notification is visible and text-based, not color-only
- preview updates remain readable and understandable
- blocked save states explain what is missing

## Success Criteria

This change is successful when:

- non-technical admins no longer have to guess the internal-name format
- namespace consistency is automatic
- category typos are prevented by the dropdown
- only the final slug needs manual typing
- empty dropdown states are clearly explained
- create flows remain premium, calm, and easy to understand
