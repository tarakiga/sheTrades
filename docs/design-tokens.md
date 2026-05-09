# SheTrades Design Tokens

## Purpose

This document defines the approved baseline tokens used by the SheTrades dashboard UI and future component library.

## Token Source Of Truth

- Type-safe tokens: `shared/src/design-tokens.ts`
- Dashboard CSS variables: `dashboard/app/globals.css`
- Review surface: `dashboard/app/page.tsx`

## Token Categories

- Color palette:
  - Brand (purple scale)
  - Accent (gold scale)
  - Neutral (gray scale)
  - Semantic (success, warning, danger, info)
- Typography:
  - Sans font stack
  - Font size scale (`xs` to `3xl`)
  - Line-height scale (`tight`, `normal`, `relaxed`)
  - Weight scale (`regular` to `bold`)
- Spacing:
  - 4px baseline scale (`0.25rem` step)
- Radius:
  - `sm`, `md`, `lg`, `xl`, `full`
- Elevation:
  - `sm`, `md`, `lg` shadows
- Iconography:
  - Size tokens (`sm`, `md`, `lg`)
  - Stroke-width tokens (`regular`, `bold`)
- Layout:
  - Content max-width
  - Reading width
  - Sidebar width
  - Header height
- Component primitives:
  - Standard control heights (`sm`, `md`, `lg`)
  - Focus ring token

## Approval Gate

Token updates must be reviewed and approved before creating new reusable components or page compositions.
