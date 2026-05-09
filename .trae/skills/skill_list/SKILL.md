---
name: skill_list
description: used throughout project lifecycle
---

### 1. Design System Guardian
**Trigger:** design tokens, colors, spacing, typography, theme
**Context:** 
- PRD.md design tokens section
- AGENT.md design system rules
- SheTrades brand: purple/gold theme
- Atomic design first

### 2. Atomic Component Builder
**Trigger:** component, button, card, modal, input, table
**Context:** 
- AGENT.md component rules
- Premium Fortune 500 standard
- All states (hover/focus/disabled/loading)
- Storybook preview required
- No hard-coded UI

### 3. Page Composer
**Trigger:** page, dashboard, layout, screen
**Context:** 
- Compose from existing components ONLY
- Design system tokens mandatory
- No inline styles
- Responsive + a11y by default

### 4. WhatsApp Flow Expert
**Trigger:** webhook, whatsapp, meta api, conversation
**Context:** 
- Direct Meta Cloud API
- Webhook signature verification
- 24hr service window rules
- Utility templates (7 total)
- PRD conversation flows

### 5. Backend Scaler
**Trigger:** cloud run, firestore, api, backend
**Context:** 
- Node.js/TS + Express
- Firestore user schema
- Cloud Run dockerfile
- 20k DAU scale patterns
- PRD API endpoints

### 6. Local Dev Setup
**Trigger:** env, docker, local, testing
**Context:** 
- .env.local + docker-compose.local.yml
- Never commit local files
- .gitignore patterns
- Production isolation

### 7. Premium Polish
**Trigger:** review, polish, quality, refactor
**Context:** 
- Lighthouse 95+
- WCAG AA compliance
- Component library audit
- No duplicated UI
- Fortune 500 standard

### 8. Deploy Master
**Trigger:** deploy, production, cloud run
**Context:** 
- GCP Cloud Run yaml
- Vercel frontend
- Firebase rules
- GitHub Actions CI/CD
- Zero downtime patterns