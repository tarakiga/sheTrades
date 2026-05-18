# Translation Queue Single-Action Cleanup

## Goal

Remove the duplicate `Request Translation` action from the translation queue so the component presents one clear premium action instead of two identical triggers.

## Approved Direction

- Keep the `Request Translation` button in the card header.
- Remove the duplicate `Request Translation` button from the empty state.
- Keep the empty state informational only.

## Why

The current queue shows the same action in two places when there are no requests:

- once in the card header
- once inside the empty state

That duplication creates visual noise and makes the component feel less intentional than the surrounding premium workspace.

## Scope

This cleanup covers only the translation queue action duplication in:

- `dashboard/components/content/TranslationRequestQueuePanel.tsx`

This cleanup does not change:

- queue data behavior
- drawer behavior
- request validation
- backend logic

## Design

### Action Ownership

The card header becomes the single source of action for the queue.

This keeps the control consistent whether the queue is:

- empty
- populated
- blocked by a workflow prerequisite

### Empty State Role

The empty state should remain focused on:

- explaining that no requests exist yet
- encouraging the user to use the queue action

It should not repeat the same button already present in the card header.

## Result

After this change, the translation queue presents:

- one primary action in the header
- one informational empty state

This produces a cleaner enterprise-grade component with stronger visual hierarchy.

## Verification

Verification should confirm:

- only one `Request Translation` button appears in the empty queue state
- the header button still opens the drawer
- the component remains free of diagnostics and dashboard type errors
