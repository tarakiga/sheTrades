# SheTrades Consolidated Task List

This document consolidates the implementation task roadmap in one place.

## Current Status

- Project phase: CORE DIRECTIVE compliance remediation (Option B phased rollout)
- Last completed task: Task 110
- Next task: Focused live review of `/`, `/login`, and `/dashboard`

## Completed Tasks

1. Task 001 - Initial workspace bootstrap
2. Task 002 - TypeScript + CI foundation
3. Task 003 - Design token system baseline
4. Task 004 - Component library primitives + preview surface
5. Task 005 - Data display + form primitives expansion
6. Task 006 - Admin dashboard overview composition
7. Task 007 - Admin page composition expansion
8. Task 008 - Admin integration adapters + error handling
9. Task 009 - Backend admin contract endpoints
10. Task 010 - Backend real data provider integration prep
11. Task 011 - Admin shell navigation layout
12. Task 012 - Real data provider scaffolding + endpoint integration tests
13. Task 013 - Schema mapping + production strict mode + negative tests
14. Task 014 - Provider hardening (safety, retry/timeout, structured logs)
15. Task 015 - Readiness endpoint + analytics strategy + Cloud Run env matrix
16. Task 016 - Live analytics semantics alignment (Postgres + Firestore)
17. Task 017 - Staging smoke flow + backend ops runbook
18. Task 018 - CI/CD smoke gate + readiness degradation alert hooks
19. Task 019 - WhatsApp webhook ingestion + core menu routing + idempotent handling
20. Task 020 - Learning progression engine hardening (module/lesson completion rules, quiz scoring, idempotency)
21. Task 021 - Reward issuance integration hardening (manual + automated issuance, retry/error handling, auditability)
22. Task 022 - Content operations tooling alignment (admin content flows mapped to backend APIs with validation)
23. Task 023 - Analytics/reporting export productionization (CSV/PDF reliability, schema governance, access controls)
24. Task 024 - End-to-end reliability and non-functional validation (performance, uptime, operational readiness)
25. Task 025 - Release readiness and production cutover checklist
26. Task 026 - PostgreSQL config platform schema + typed API contracts baseline
27. Task 027 - JWT authentication + RBAC guardrails for admin config APIs
28. Task 028 - Config service layer (draft storage, publish validation, version graph, rollback primitives, audit logging)
29. Task 029 - Admin config CRUD endpoints (content, options, legal blocks) + version history endpoints
30. Task 030 - Public read-only published config endpoints + cache versioning/invalidation strategy
31. Task 031 - Component library additions for config management + preview surfaces
32. Task 032 - Admin management UI composition (options manager, legal/content editor, draft/preview/publish, rollback console)
33. Task 033 - Frontend runtime migration to dynamic published config API (remove hardcoded mutable values/fallback business content)
34. Task 034 - End-to-end compliance validation against CORE DIRECTIVE + release/governance artifact update
35. Task 035 - Option A UI copy externalization for admin/dashboard pages via dynamic config-managed runtime keys
36. Task 036 - Admin UI copy seed pack + publish automation script and operator runbook
37. Task 037 - Loading/error/preview runtime copy externalization + localized admin UI seed schema (EN/PCM/IG)
38. Task 038 - Runtime blocker remediation (bot/runtime policy externalization, admin config protected CRUD UI wiring, governance baseline files)
39. Task 039 - Repository-wide absolute compliance closure and final strict PASS sweep report
40. Task 040 - Config namespace UX differentiation (content/options/legal route-specific manager behavior)
41. Task 041 - Unified settings workspace with horizontal tabs and `/config/*` route consolidation
42. Task 042 - Non-technical settings language rewrite for admin usability
43. Task 043 - Backend CORS enablement for local dashboard admin actions
44. Task 044 - Development-mode CORS fallback for unknown local dashboard origins
45. Task 045 - Settings access feedback states for save key and reload actions
46. Task 046 - Workflow action feedback for create, draft, publish, history, restore, and hide
47. Task 047 - Hide/show item workflow with backend reactivation support
48. Task 048 - Hydration mismatch hardening for root layout and admin shell
49. Task 049 - Hydration mismatch hardening for shared UI primitives
50. Task 050 - Settings management card layout expansion for wider review table
51. Task 051 - Settings table row actions, preview drawer, and safe trash workflow
52. Task 052 - Premium icon action rail for settings table and targeted settings-tab hydration hardening
53. Task 053 - Premium settings table density pass and drawer footer hierarchy refinement
54. Task 054 - Guided settings workspace revamp design spec for table-first premium admin tabs
55. Task 055 - Guided settings workspace implementation with reusable drawers, toolbar, filters, and previews
56. Task 056 - Settings table status-column restoration and right-aligned actions refinement
57. Task 057 - Guided internal-name builder design for non-technical create flows
58. Task 058 - Guided internal-name builder implementation with managed category sourcing and helper states
59. Task 059 - In-tab category management and premium dropdown design
60. Task 060 - In-tab category management implementation, premium dropdown upgrade, and drawer focus fix
61. Task 061 - Content type auto-mapping and friendly content-kind labeling in settings
62. Task 062 - Settings request parser hardening for non-JSON upstream responses
63. Task 063 - Filter chip hydration hardening for extension-injected attributes
64. Task 064 - Content page premium parity design with settings-backed drawer reuse
65. Task 065 - Content page premium parity implementation with shared managed content workspace reuse
66. Task 066 - Settings scope reduction after content split design
67. Task 067 - Settings scope reduction implementation and legacy content-link redirect cleanup
68. Task 068 - Internal translation request flow design for the content support panel
69. Task 069 - Internal translation request workflow implementation with managed option sets, preview coverage, and protected admin APIs
70. Task 074 - Translation queue single-action cleanup design
71. Task 075 - Translation queue single-action cleanup implementation
72. Task 076 - Dual-path translation method design for internal requests and queued integration jobs
73. Task 077 - Dual-path translation workflow implementation with managed method options and integration queue states
74. Task 081 - Post-translation completion and review workflow design
75. Task 082 - Translation completion backend implementation with managed draft write-back
76. Task 083 - Translation completion UI workflow in `/content`
77. Task 084 - Translation completion preview coverage and ready-for-review states
78. Task 085 - Translation completion verification and tracking updates
79. Task 086 - Settings integration workspace design for WhatsApp and Notification managed providers
80. Task 087 - Integration namespace backend foundation, runtime helpers, and protected connection-test endpoints
81. Task 088 - Reusable integration workspace components and premium provider drawers
82. Task 089 - Integration workspace preview coverage with nested provider tabs and connection states
83. Task 090 - `/settings` Integration tab composition with nested WhatsApp/Notification tabs and access-key relocation
84. Task 091 - Integration workspace verification and tracking updates
85. Task 092 - Admin login and profile experience design
86. Task 093 - Backend admin auth foundation with seeded accounts, session-backed JWT issuance, and protected auth/profile endpoints
87. Task 094 - Reusable auth/profile component library and preview coverage
88. Task 095 - Premium `/login`, `/profile`, sidebar profile card, and admin route-guard composition
89. Task 096 - Auth/profile verification, documentation, and handoff updates
90. Task 097 - Overview and users premium workspace redesign design
91. Task 098 - Shared overview/users workspace primitives and preview coverage
92. Task 099 - `/overview` premium workspace composition
93. Task 100 - `/users` premium workspace composition with preview-ready action rail
94. Task 101 - Overview/users verification, tracking, and focused parity handoff
95. Task 102 - Analytics, rewards, and reports premium workspace redesign design
96. Task 103 - Shared analytics/rewards/reports workspace additions and preview coverage
97. Task 104 - `/analytics` premium workspace composition
98. Task 105 - `/rewards` and `/reports` premium workspace composition plus verification
99. Task 106 - Executive-premium `/login` redesign design
100. Task 107 - Executive-premium auth shell and login form upgrades plus preview coverage
101. Task 108 - Executive-premium `/login` page composition and verification
102. Task 109 - Root smart redirect design
103. Task 110 - Root smart redirect implementation and verification

## Planned Next Tasks

- Focused live review of `/`, `/login`, and `/dashboard`
- Decide whether the old design-tokens review surface should later move to a dedicated internal preview route
- Decide whether the root entry handoff should later expose environment-aware messaging for staging versus production

## Option B Rollout Notes

- Delivery model: phased rollout with backward-compatible migration gates.
- Foundation order: schema/contracts -> security -> service/workflows -> API -> components/previews -> admin pages -> runtime cutover -> compliance validation.
- Quality gate: no UI implementation starts before Task 026 outputs (database schema and API contracts) are reviewed.

## Source of Truth Notes

- PRD product scope and architecture: `PRD.md`
- Task execution history and per-task verification details: `handoff.md`
- This file is a clean index to make sequencing and planning easy before execution.
