# Hydration Mismatch Hardening For Admin Shell

## Goal

Remove noisy hydration mismatch warnings on the admin settings flow when browser extensions inject extra attributes into server-rendered HTML before React hydration.

## Problem

The admin experience renders through Next.js server output and then hydrates on the client. Browser extensions are adding attributes to:

- the root `html` element
- the root `body` element
- admin navigation links inside the shared admin shell

This creates a mismatch between server-rendered markup and client-side expectations, which surfaces as a hydration warning even though the app logic itself is working.

## Chosen Approach

Apply targeted hydration-warning suppression at the known mutation points instead of changing data flow or disabling SSR.

### Root Layout

Update `dashboard/app/layout.tsx` to add `suppressHydrationWarning` on:

- `html`
- `body`

This addresses extension-injected attributes on the document root.

### Admin Shell

Update `dashboard/components/layout/AdminShell.tsx` to tolerate extension-injected attributes on navigation links during hydration.

The navigation structure, routing behavior, active-link logic, and copy resolution remain unchanged.

## Why This Approach

- It solves the actual source of noise shown in the error report.
- It is minimal and low-risk.
- It preserves current server rendering, navigation behavior, and runtime data flow.
- It avoids unrelated refactoring.

## Non-Goals

- No changes to config management logic
- No API changes
- No route changes
- No visual redesign

## Verification

- Load `http://localhost:3000/settings`
- Confirm the previous hydration mismatch warning no longer appears for the affected nodes
- Run dashboard lint and typecheck
- Check diagnostics for touched files

## Risks

- Suppression should stay narrowly scoped so real hydration bugs are not hidden elsewhere.
- If an extension injects attributes into additional nodes later, more targeted suppression may be needed.
