# Login Desktop No-Scroll Refinement

## Goal

Refine the premium `/login` experience so the desktop idle state fits within the viewport without vertical scrolling, while preserving the executive split-workspace composition and maintaining current tablet/mobile behavior.

## Approved Direction

- keep the executive split-workspace composition
- enforce a strict no-scroll desktop idle state
- solve the issue through tighter desktop rhythm rather than content removal
- keep the work shared-component-first
- avoid page-only layout hacks

## Product Direction

The `/login` page should remain premium, calm, and executive in tone, but the desktop version should become more height-efficient so the entire entry experience fits within common desktop viewport heights.

This refinement should:

- preserve both left and right panels
- keep the sign-in action visually dominant
- retain the trust/support framing
- reduce unnecessary vertical space
- avoid a cramped or overly compressed feel

## Layout Strategy

The desktop solution should come from rebalancing the shell rather than shrinking the form into an uncomfortable state.

Desktop behavior should:

- constrain the shell to the viewport height
- reduce outer page padding
- tighten shell gaps between hero, card, support, and footer
- reduce right-panel vertical density
- keep the form card comfortable while trimming excess spacing

Responsive behavior should remain:

- desktop uses viewport-fit composition
- smaller breakpoints keep normal document flow

## Component Adjustments

### Auth Shell

`AuthPageShell` should support a desktop-focused viewport-fit mode.

That mode should:

- reduce inter-section spacing
- tighten hero copy and metrics rhythm
- compact the support region
- compact the right trust panel without stripping it down
- preserve the existing responsive collapse below desktop

### Login Form Card

`LoginFormCard` should support a compact density mode for desktop.

That mode should:

- tighten header and body padding
- reduce form gap spacing
- compact banner, hint, and helper rhythm
- keep the CTA prominent
- keep recovery/help actions integrated cleanly

## Copy Discipline

The desktop no-scroll goal should also be supported by copy rhythm:

- shorter supporting descriptions
- reduced redundancy
- concise support/footer messaging

This should improve first-screen comprehension rather than simply shrinking the layout.

## Preview And Verification

Implementation should:

1. refine shared auth shell and login form card density
2. update preview coverage so desktop-fit behavior is reviewable
3. verify `/login` across desktop and responsive breakpoints
4. run diagnostics, typecheck, and production build
5. update tracking docs and handoff

Verification should confirm:

- no vertical scroll on common desktop heights for the idle `/login` state
- no clipped content
- no degraded readability
- preserved mobile/tablet behavior
- loading/error/help states remain understandable and contained

## Scope Control

This pass should remain focused on:

- desktop no-scroll behavior for `/login`
- shared auth shell refinement
- shared login card density refinement
- preview and verification updates

This pass should not:

- reopen the broader auth redesign
- change backend auth behavior
- redesign `/profile`
- introduce one-off page-only desktop overrides

## Outcome

When complete:

- `/login` retains the premium executive split layout
- the desktop idle state fits cleanly in one viewport
- the refinement remains reusable and component-first
