# Root Smart Redirect Design

## Goal

Replace the production use of the old design-token homepage at `/` with a smart application entry route that directs users into the correct admin experience.

This change should:

- stop exposing the internal design-token review surface as the production homepage
- make `/` the canonical app entry point
- send authenticated users to `/dashboard`
- send unauthenticated users to `/login`
- keep the transition polished and aligned with the premium admin product

## Approved Direction

- use a **smart redirect** at `/`
- make the root route a thin entry layer rather than a content page
- show a calm loading handoff while session state resolves
- preserve the existing auth/session model rather than introducing new auth logic
- keep the change focused to the root route only

## Why

The current root route still renders the early design-token review page:

- useful during foundation work
- not appropriate as the deployed product homepage

In production, the first route users hit should behave like an actual application entry point:

- signed-in admins should get straight to work
- signed-out users should go directly into the sign-in flow
- no one should land on an internal design-review surface first

This change closes that gap cleanly without reopening the broader admin information architecture.

## Scope

This design covers:

- `dashboard/app/page.tsx`
- the root-entry loading handoff behavior
- root-route verification

This design does not cover:

- redesigning `/dashboard`
- creating a public marketing homepage
- changing backend auth/session contracts
- changing `/login` or `/profile` behavior outside the root-entry decision flow
- relocating the design-token review surface in this pass

## Product Direction

The root route `/` should become the canonical app entry point.

Production behavior should be:

- authenticated users land on `/dashboard`
- unauthenticated users land on `/login`
- the old tokens page is no longer used as the homepage

This aligns the deployed product with real user expectations and removes a confusing internal artifact from the main entry path.

## Routing Model

The cleanest implementation is to make `dashboard/app/page.tsx` a lightweight client-side entry redirect that reads the existing admin session state and routes accordingly.

Expected behavior:

- `loading` -> show a brief handoff state
- `authenticated` -> redirect to `/dashboard`
- `unauthenticated` -> redirect to `/login`

Why this fits the existing architecture:

- `AdminSessionProvider` already resolves stored session state
- `AdminAuthGate` already protects the admin workspace
- `/login` already redirects authenticated users away

This means the root route only needs to make the initial entry decision rather than duplicating any auth logic.

## UX And State Behavior

Even though this is a thin routing layer, it should still feel like part of the premium admin product.

### Entry Handoff

The root route should show a short loading handoff while session state resolves.

That handoff should feel:

- calm
- branded to the admin product
- brief
- non-technical

It should avoid:

- flashing the old tokens page
- blank-screen ambiguity
- jarring route transitions

### State Rules

The route should support only:

- `loading`
- `authenticated`
- `unauthenticated`

No extra content, no extra branching, and no duplicate auth workflows.

## Scope Control

This should remain a focused routing correction.

That means:

- remove the production use of the design-token page from `/`
- do not redesign `/dashboard` again
- do not introduce a public homepage
- do not change the current auth/session contracts

If the token review surface is still useful internally, it can move to a separate review route later, but it should no longer be the deployed homepage.

## Implementation Order

Build in this order:

1. replace the current root page with a thin smart-entry route
2. wire it to the existing session provider
3. add the calm loading handoff state
4. run diagnostics, typecheck, and production build
5. update tracking docs and handoff

## Testing And Verification

Verification should include:

- diagnostics on the edited root route files
- `npm run typecheck -w @shetrades/dashboard`
- `npm run build -w @shetrades/dashboard`
- focused review of `/` in both signed-in and signed-out states

## Outcome

When complete:

- `/` will behave like a proper application entry point
- signed-in users will land on `/dashboard`
- signed-out users will land on `/login`
- the deployed experience will no longer expose the internal design-token review page as the homepage
