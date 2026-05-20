# Login Desktop Focus Rebalance

## Goal

Refine the desktop viewport-fit `/login` mode so the sign-in card remains the primary focus, the desktop hero metrics are removed, and the right-panel reassurance list becomes denser and less visually dominant.

## Approved Direction

- remove the desktop hero metrics strip in viewport-fit login mode
- tighten the right-panel list spacing
- keep the right panel as reassurance context rather than competing content
- let the recovered height keep the bottom of the login card fully visible
- preserve smaller-breakpoint behavior

## Scope

This refinement is limited to:

- the desktop viewport-fit auth shell mode
- right-panel spacing in the desktop login layout
- `/login` verification and preview review

It does not reopen the broader login redesign or backend auth flow.

## Outcome

When complete:

- the sign-in card is clearly the dominant surface
- the desktop right panel reads tighter and calmer
- the idle desktop login card is no longer cropped by competing upper content
