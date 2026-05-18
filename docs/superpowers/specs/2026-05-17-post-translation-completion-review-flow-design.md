# Post-Translation Completion And Review Flow Design

## Goal

Extend the `/content` translation workflow so that once translation work is finished, the translated result is written back into the managed content system as a draft and then reviewed before publishing.

## Approved Direction

- Completing a translation should create or update a content draft.
- The translated content should not go live automatically.
- The queue should move into a review-oriented state after write-back.
- Final publishing should use the existing managed content draft and publish workflow.

## Why

The current translation queue can request work and track status, but it stops before the translation becomes usable in the actual content system.

The right next step is not a separate publishing path. The right next step is to connect translation completion to the existing content draft and publish model.

This keeps:

- one source of truth for content
- one review and publishing workflow
- safer quality control before translated content goes live

## Scope

This design covers:

- marking translation work as completed
- capturing translated output
- writing translated output into the target content document draft
- moving the queue item into a review-ready state
- allowing final publish through the existing content workflow

This design does not cover:

- real external integration callbacks
- provider-specific translation APIs
- assigning work to individual translators
- multi-step legal approval workflows
- automatic publishing

## Workflow Summary

### 1. Translation Request Exists

The workflow begins from an existing queue item created through:

- `Send Internal Request`
- `Translate With Integration`

### 2. Translation Is Completed

When translation work is done, an authorized user opens the queue item and submits the translated content result.

### 3. Draft Write-Back Happens

The system writes the translated content into the target content item as a new draft update.

### 4. Queue Moves To Review

After a successful write-back, the translation request status becomes:

- `ready_for_review`

This means the translated content exists in draft form and is waiting for final approval.

### 5. Final Publish Happens Through Existing Content Workflow

An admin or authorized reviewer uses the normal content preview and publish path to approve the translated draft and publish it live.

## Status Model

The translation workflow should evolve beyond the current request-only statuses.

Recommended status set:

- `pending`
- `queued_for_integration`
- `in_review`
- `ready_for_review`
- `completed`
- `integration_failed`

### Status Meaning

- `pending`: internal translation request has been submitted and is waiting for work
- `queued_for_integration`: integration job has been queued for processing
- `in_review`: translation work is actively being reviewed or prepared
- `ready_for_review`: translated result has been written into the content draft and is ready for final publishing review
- `completed`: translated content has been published or the workflow has been explicitly finalized
- `integration_failed`: integration path failed and needs attention

## Completion UX

### Queue Item Action

Each translation queue item should gain a next-step action such as:

- `Complete Translation`

This action should open a dedicated side drawer.

### Completion Drawer

The drawer should collect:

- translated result
- optional completion note
- translated language confirmation

The drawer should also show lightweight source context:

- content title
- content key
- translation method
- current target language

### Submit Behavior

When the user submits the completion form:

- validate the translated result
- write the translated content into the target content document draft
- update the translation request status to `ready_for_review`
- show clear success feedback

## Content Write-Back Rules

The translated result should be written into the same managed content document that the request references.

### For `ui_copy`

The system should add or update the relevant language entry in the existing payload structure.

### For `lesson_content`

The system should add or update the relevant language entry in the lesson payload structure without overwriting unrelated fields.

### Safety Requirement

The write-back must be additive and targeted:

- preserve other languages
- preserve unrelated payload fields
- update only the intended translated language content

If the payload shape is unsupported or ambiguous, the operation should fail safely with a clear error rather than corrupting the content document.

## Review And Publish Model

The content document remains the source of truth.

After translation completion:

- the queue communicates that the content is ready for review
- the content workspace remains the place for previewing and publishing the draft

This means the translation queue should not gain a separate direct publish implementation in this pass.

## Queue Presentation

Queue items should show enough state for operators to understand what happens next.

Recommended presentation:

- method badge
- status badge
- action button when the queue item can move forward

Examples:

- `Pending` + `Complete Translation`
- `Queued for Integration` + no completion action yet if the provider has not returned a result
- `Ready for Review` + `Open Content Draft`
- `Completed` + no primary action

## Permissions

Recommended permissions:

- `viewer`
  - can read the queue
  - cannot complete translation
- `editor`
  - can complete translation
  - can create draft write-back
- `admin`
  - can complete translation
  - can publish final content

This matches the existing draft/publish separation already used elsewhere in the product.

## Architecture

### Backend

The translation request model should be extended to support:

- completion note
- completion timestamp
- review-ready status
- optional reference to the draft version created during write-back

The backend should expose a protected action to complete a translation request and apply the translated result to the target content draft.

### Content Integration

The completion action should reuse the existing config content draft update flow instead of duplicating content storage logic.

The translation system should call the managed content draft update path with a transformed payload that includes the translated language result.

### Frontend

The `/content` translation queue should gain:

- queue item completion actions
- completion drawer
- success and error feedback states
- clear review-follow-up states after write-back

## Validation

The completion workflow should validate:

- request exists
- request is in a completable state
- translated result is not empty
- target language is valid
- referenced content document still exists
- payload transformation is supported for the content type

If validation fails, the content draft must not be changed.

## Error Handling

The workflow should fail safely in the following situations:

- target content item was deleted or archived
- payload shape does not support safe language injection
- user lacks permission
- translation request is already finalized

In these cases:

- keep the queue item intact
- do not create a broken draft
- return a human-readable error message

## Preview Coverage

The component preview surface should be extended to show:

- a queue item awaiting completion
- a completion drawer with translated result input
- a queue item in `ready_for_review`

No production implementation should ship without preview coverage for these new states.

## Testing And Verification

Verification should confirm:

- completion action opens the correct drawer
- submitting translated output writes a new draft to the linked content document
- request status becomes `ready_for_review`
- unrelated languages and fields remain intact
- final publish still uses the existing content workflow
- dashboard and backend stay free of diagnostics and type errors

## Result

After this change, translation becomes a true end-to-end workflow:

- request translation
- complete translation
- write translated result into draft
- review
- publish

This keeps the system premium, operationally clear, and aligned with the managed content architecture already used by the platform.
