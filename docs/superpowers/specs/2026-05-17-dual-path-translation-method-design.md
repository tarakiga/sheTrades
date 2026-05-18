# Dual-Path Translation Method Design

## Goal

Extend the `/content` translation workflow so admins can choose between:

- sending an internal translation request
- queueing a translation integration job

This should happen through one premium drawer flow with a single clear method selector.

## Approved Direction

- Add a `Translation Method` selector to the drawer.
- Keep one submit action.
- Support two methods:
  - `Send Internal Request`
  - `Translate With Integration`
- Do not call the external integration immediately.
- Instead, save an internal integration job record that starts in a queued state for later processing.

## Why

The product now needs two valid paths for translation work:

- a human follow-up workflow
- an integration-backed workflow

Both belong in the same content operations drawer because they solve the same user goal:

- take a content item
- choose a language
- route translation work in the right way

Using one selector avoids duplicate drawers, duplicate buttons, and unnecessary cognitive load.

## Scope

This design covers:

- drawer method selector
- backend contract updates for translation method
- queued integration-job records
- queue display updates so method and status are understandable

This design does not cover:

- real external integration execution
- vendor-specific credentials or provider settings UI
- retries, callbacks, or webhook handling
- assignment workflows

## UX Design

### Drawer Flow

The translation drawer should include a top-level field:

- `Translation Method`

Options:

- `Send Internal Request`
- `Translate With Integration`

### Method Guidance

The drawer should explain the difference in simple language:

- `Send Internal Request`: the team follows up manually
- `Translate With Integration`: the item is queued for automated translation processing

### Submit Action

Keep one submit button, but make the label method-aware:

- if method is internal request:
  - `Send Request`
- if method is integration:
  - `Queue Integration`

This keeps the drawer clear while giving stronger feedback about what will happen next.

## Data Model

The translation workflow record should be extended with:

- `method`

Recommended values:

- `internal_request`
- `integration_job`

The model should also support future integration metadata, such as:

- `integrationState`
- `integrationJobId`

These metadata fields can remain optional and unused in the first release of this dual-path design.

## Queue Model

The `/content` translation queue should remain one shared operational list.

It should support both record types.

### Status Behavior

Internal request path:

- starts in `Pending`

Integration path:

- starts in `Queued for Integration`

### Queue Presentation

Each queue item should clearly communicate both:

- method
- status

Recommended presentation:

- small method badge
- status badge

This is clearer than overloading status alone to explain everything.

## Backend Behavior

### Internal Request Path

If the selected method is `Send Internal Request`:

- create the same internal workflow record concept already implemented
- assign method `internal_request`
- assign status `pending`

### Integration Path

If the selected method is `Translate With Integration`:

- create an internal workflow record
- assign method `integration_job`
- assign status indicating it is queued for automated processing

The backend should not contact an external provider in this step.

## API Shape

The create request payload should include:

- `method`

The bootstrap response and queue records should also return method information so the client can render the correct badges and labels.

## Managed Configuration Alignment

This design should continue following the no-hardcoded-mutable-values rule as much as possible.

The first pass may keep the two method values as typed contract enums because they define application behavior, not mutable editorial content.

However, user-facing labels shown in the drawer and queue should remain easy to externalize later if needed.

## Validation

The form should validate:

- method selected
- content selected
- target language selected
- priority selected
- note length remains within the allowed limit

If a selected method is invalid, the request should fail with a clear server-side validation error.

## Preview Coverage

The component preview surface should be updated to show:

- internal request mode
- integration mode
- queue items for both methods

No production use should happen without updating the preview reference.

## Testing And Verification

Verification should confirm:

- drawer shows the new `Translation Method` selector
- submit button label changes with the selected method
- internal requests create records with method `internal_request`
- integration requests create records with method `integration_job`
- queue renders method-aware labels for both paths
- dashboard and backend remain free of diagnostics and type errors

## Result

After this change, `/content` supports one premium translation flow with two execution paths:

- internal human request
- queued integration job

This keeps the UI clear, preserves a single queue surface, and prepares the product for future automated translation execution without overbuilding the first release.
