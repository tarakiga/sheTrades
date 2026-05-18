# Primary Color Recalibration Design

## Goal

Recalibrate the SheTrades dashboard primary color system so `#334E58` becomes the approved primary anchor across the design-token source of truth, the dashboard CSS token bridge, and the live brand-driven interaction states.

## Approved Direction

- Replace the existing purple `brand` family with a slate-steel family anchored at `brand.500 = #334E58`.
- Keep the `accent` family unchanged.
- Update the shared focus-ring token and the dashboard CSS bridge so primary hover, selected, active, and focus treatments remain coherent.
- Replace direct primary-purple styling in dashboard auth and workspace surfaces with the recalibrated brand tokens or matching derived rgba treatments.

## Scope

### Included

- `shared/src/design-tokens.ts`
- `dashboard/app/globals.css`
- `docs/design-tokens.md`
- project tracking updates in `docs/task-list.md` and `handoff.md`

### Excluded

- structural UI changes
- component API changes
- non-primary semantic palette changes
- accent palette changes

## Token Strategy

- Treat `#334E58` as `brand.500`.
- Rebuild the full `brand` scale around that anchor so light surfaces, selected states, hover treatments, and darker emphasis states all remain internally consistent.
- Expand the dashboard CSS bridge to expose the full brand family because the UI already consumes intermediate brand shades.

## Implementation Notes

- Prefer token references over raw hard-coded primary colors where practical.
- Preserve existing component behavior and layouts.
- Keep the update constrained to color-system consistency rather than broader visual redesign.

## Verification

- Run diagnostics on edited files.
- Run dashboard type validation.
- Run dashboard production build.

## Success Criteria

- The new primary anchor is `#334E58` in the token source of truth.
- Primary UI states no longer mix the old purple family with the new primary.
- Dashboard build and typecheck pass after the token migration.
