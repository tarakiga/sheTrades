# Hydration Mismatch Hardening For Shared UI Primitives

## Goal

Reduce recurring Next.js hydration mismatch warnings caused by browser extensions mutating shared UI primitives before React hydration.

## Problem

After hardening the root layout and admin shell links, hydration warnings still appear in reusable UI primitives. The latest traces point to extension-injected attributes on:

- `button` elements
- `section` wrappers
- shared header/action wrappers

These mutations happen before React hydrates and are not caused by app state or backend data.

## Chosen Approach

Apply narrow hydration-warning suppression to the shared primitives currently implicated by the browser trace:

- `dashboard/components/ui/Button.tsx`
- `dashboard/components/ui/EmptyState.tsx`
- `dashboard/components/ui/SectionHeader.tsx`

## Planned Changes

### Button

Add `suppressHydrationWarning` to the root `<button>` element.

### EmptyState

Add `suppressHydrationWarning` to the root `<section>` element.

### SectionHeader

Add `suppressHydrationWarning` to the root `<header>` element and keep current structure unchanged.

## Why This Approach

- It targets the exact shared components named in the hydration trace.
- It prevents page-by-page patching of the same extension-driven issue.
- It keeps SSR, styling, and component APIs intact.
- It is low-risk and consistent with the earlier root/admin-shell hydration hardening pass.

## Non-Goals

- No backend changes
- No route changes
- No visual redesign
- No component API redesign

## Verification

- Load affected admin pages such as `/settings` and `/rewards`
- Confirm the previous hydration mismatch warnings are reduced or eliminated for these primitives
- Run dashboard lint and typecheck
- Check diagnostics on touched files

## Risks

- Suppression must remain limited to confirmed mutation points so real hydration issues elsewhere remain visible.
- If extensions later mutate additional shared primitives, another targeted pass may still be needed.
