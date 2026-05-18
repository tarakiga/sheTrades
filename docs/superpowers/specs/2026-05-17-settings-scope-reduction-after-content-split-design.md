# Settings Scope Reduction After Content Split

## Goal

Remove the `Content` tab from `/settings` now that `/content` is the dedicated premium content workspace, while preserving a clean redirect path for older links that still point to `/settings?tab=content`.

## Approved Direction

- Keep `/content` as the dedicated content route.
- Reduce `/settings` to two tabs only:
  - `Options`
  - `Legal`
- Redirect any legacy `/settings?tab=content` traffic to `/content`.
- Update settings copy so the page no longer claims to manage content there.

## Why This Change

The product now has a clear dedicated content route:

- `/content` owns content operations
- `/settings` should own settings-specific work only

Leaving `Content` visible inside `/settings` would create two visible entry points for the same premium content workspace. That introduces avoidable ambiguity for admins and weakens route ownership.

This change simplifies the information architecture:

- content has one clear home
- settings keeps only the remaining settings domains

## Scope

This design covers:

- removing the content tab from `/settings`
- narrowing the settings tab resolver to `options` and `legal`
- redirecting old `?tab=content` URLs to `/content`
- updating visible copy for the settings page and tab card

This design does not cover:

- removing the `/content` route
- changing the content workspace itself
- backend schema or API changes

## Information Architecture

After this change, route ownership becomes:

- `/content` -> content workspace
- `/settings` -> options and legal settings

This should be reflected both in navigation semantics and in page copy.

## Settings Page Behavior

### Allowed Tabs

The settings page should recognize only:

- `options`
- `legal`

The safe default should become `options`.

### Legacy Content Links

If `searchParams.tab === "content"`, the page should redirect to `/content`.

This preserves compatibility for:

- old bookmarks
- old redirects
- stale links in notes or browser history

The goal is not just to hide the tab. The route should actively guide the user to the new content home.

## Tab Card Design

The `Configuration Areas` card should now show only two tabs:

- `Options`
- `Legal`

No empty placeholder or disabled content tab should remain.

This keeps the settings page clean and intentional.

## Copy Updates

The settings page copy should reflect the new narrower scope.

### Header

The description should move away from language like:

- `Manage content, options, and legal configuration in one clear workspace.`

Toward language like:

- `Manage option lists and legal content in one clear workspace.`

### Tab Card Description

The tab card description should no longer mention all three domains or imply content lives here.

It should describe editing the two remaining settings areas only.

## Redirect Strategy

The content split has already created a dedicated premium route. Redirecting old content-tab settings links is the cleanest way to preserve continuity.

### Preferred Behavior

- `/settings` -> opens on `options`
- `/settings?tab=options` -> stays on settings options
- `/settings?tab=legal` -> stays on settings legal
- `/settings?tab=content` -> redirects to `/content`
- unknown tab values -> fall back to `options`

This avoids dead or ambiguous intermediate states.

## Related Legacy Route Consideration

The project already contains a legacy `/config/content` redirect.

That route should ultimately resolve cleanly to the new content home rather than reinforcing the removed settings content tab.

This implementation pass should at minimum avoid introducing a contradictory redirect path.

## Implementation Shape

The implementation should stay small and focused:

- update the tab union in `dashboard/app/(admin)/settings/page.tsx`
- remove the content tab entry from the tab config list
- update the active-tab resolver behavior
- add redirect handling for `tab=content`
- tighten page copy to reflect the new scope

No drawer or shared workspace behavior changes are needed for this pass.

## Error Handling And UX

This change should feel seamless:

- users following an old content-tab settings link should land in `/content`
- users opening `/settings` should see a clean two-tab page
- no broken states, missing-tab messages, or empty shells should appear

## Testing And Verification

Verification should confirm:

- `/settings` defaults to the `Options` tab
- `/settings?tab=options` renders the options workspace
- `/settings?tab=legal` renders the legal workspace
- `/settings?tab=content` redirects to `/content`
- the settings page no longer displays a content tab
- settings copy no longer claims content is managed there
- touched files remain free of diagnostics and type errors

## Risks

The main risk is leaving behind stale copy or stale redirects that still imply content belongs inside settings.

That risk is addressed by making this a complete scope reduction rather than a visual-only hide:

- remove the tab
- update the copy
- redirect legacy content-tab links

## Result

After this change, the product structure is clearer:

- `/content` is the single visible home for content
- `/settings` is focused on options and legal only
- old content-tab settings links still land users in the right place
