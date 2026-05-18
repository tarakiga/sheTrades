# Internal Translation Request Flow For Content Workspace

## Goal

Turn the inactive `Request Translation` action on `/content` into a real internal workflow that lets admins submit translation requests, store them inside the product, and review them in the content support panel.

## Approved Direction

- Implement a real internal translation request flow.
- Open the request flow in a premium side drawer from `/content`.
- Save requests inside the admin product rather than sending people to an external handoff.
- Show saved requests in the translation queue panel on `/content`.
- Do not add notifications or a separate translation operations platform in this pass.

## Why This Change

The current button is misleading because it looks actionable but does nothing.

That creates two product problems:

- the interface promises a workflow that does not exist
- the content support panel does not yet function as a real operational surface

This change converts the support panel from a placeholder into a small but real product workflow while keeping scope disciplined.

## Scope

This design covers:

- translation request drawer on `/content`
- internal request persistence
- request list rendering in the `/content` support panel
- premium feedback states for submit and empty/non-empty queue states

This design does not cover:

- translator assignment
- email or webhook notifications
- external translation vendor integrations
- a full translation operations console
- SLA tracking or reviewer pipelines

## Product Model

This feature should be treated as a lightweight internal request queue for content operations.

The user intent is simple:

- choose content that needs translation
- specify target language and context
- save the request
- see that it now exists in the queue

This is enough to make the button real and useful without inventing a second large subsystem.

## Entry Point

The `Request Translation` button on `/content` should open a side drawer.

It should no longer be a passive button with no behavior.

## Drawer Design

The drawer should feel consistent with the premium content/settings drawers already used in the product.

### Drawer Content

The drawer should collect:

- content item
- target language
- priority
- request note

### Field Intent

#### Content Item

This should be chosen from existing managed content items so the request is tied to a real content document, not freeform text.

The selection should use a friendly label and enough metadata to identify the item clearly.

#### Target Language

This should be selected from a controlled list.

For this pass, the language set should stay intentionally small and aligned with current product language expectations.

#### Priority

Use a simple priority model:

- `Low`
- `Normal`
- `High`

#### Request Note

This is optional but should allow the requester to add context, such as:

- where the translation will be used
- whether wording should stay instructional or conversational
- timing or content nuance

## Data Model

Introduce an internal translation request entity.

### Required Fields

- `id`
- `contentKey`
- `contentTitle`
- `sourceLanguage`
- `targetLanguage`
- `priority`
- `note`
- `status`
- `requestedBy`
- `requestedAt`

### Initial Status Set

- `pending`
- `in_review`
- `completed`

For this pass, newly created requests should start as `pending`.

## Persistence Strategy

Requests should be saved inside the product using a dedicated internal backend path rather than local-only UI state.

The implementation may use the existing backend stack and persistence patterns already used by admin-managed features, but it should remain logically separate from config documents because translation requests are operational workflow records, not published runtime configuration.

## Queue Panel Behavior

The translation queue panel on `/content` should become a real request list.

### Empty State

If no requests exist:

- keep the polished empty-state design
- the `Request Translation` action should still open the drawer

### Non-Empty State

If requests exist:

- render them as a compact operational list
- show enough metadata to understand each request quickly

Recommended visible fields:

- content title
- target language
- priority
- status
- requested time

## Feedback Model

The workflow must provide visible feedback at every important step.

### On Open

- drawer opens cleanly

### On Validation Failure

- field-level or drawer-level guidance explains what is missing

### On Save

- submit action shows loading feedback

### On Success

- drawer closes
- success feedback appears
- queue panel updates immediately

### On Error

- clear failure feedback appears without losing user trust

## Relationship To Content Workspace

This feature belongs to `/content` because it is a content-operations support workflow.

It should remain secondary to the main content management table:

- content table remains the dominant workspace
- translation queue remains a support surface

The queue should not compete visually with the primary content manager.

## Language And UX

Use non-technical language throughout:

- `Request Translation`
- `Select Content`
- `Target Language`
- `Priority`
- `Notes`
- `Pending`
- `In Review`
- `Completed`

Avoid implementation-oriented wording or internal IDs in the primary UI.

## Implementation Shape

The clean implementation path should:

- add a dedicated backend model/endpoint for translation requests
- add a content-route drawer component or shared operational drawer component if appropriately reusable
- wire the `/content` page to:
  - open the drawer
  - submit requests
  - refresh the queue

This should remain a focused feature, not the beginning of a large translation subsystem.

## Validation

The form should validate:

- content item is selected
- target language is selected
- priority is selected
- note length stays within a reasonable limit if provided

Publishing-style validation is not needed because these are operational records, not published config.

## Testing And Verification

Verification should confirm:

- `Request Translation` opens a real drawer
- a valid request can be saved
- saved requests appear in the `/content` queue panel
- new requests start in `Pending`
- empty state transitions correctly to a non-empty request list
- feedback appears during submit, success, and error states
- touched frontend and backend files remain free of diagnostics and type errors

## Risks

The main risk is letting this grow into a full translation-management platform prematurely.

That risk is addressed by keeping the first pass intentionally narrow:

- internal request creation
- internal request listing
- simple statuses
- no notifications or assignment logic

## Result

After this change, the `Request Translation` action becomes real, the support panel gains practical value, and `/content` feels more complete without overextending into a separate translation product.
