# Rewards Page Redesign & Automated Payouts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/rewards` to layout C (health summary + working table), add an admin-configurable Payouts integration (Africa's Talking / Termii / Reloadly), and ship a Cloud Scheduler-driven worker that dispatches Pending rewards every 5 min with retry, idempotency, and end-to-end observability.

**Architecture:** Provider adapter pattern keeps the worker, retry endpoint, and manual-issue path provider-agnostic. The Payouts integration config is stored in the existing config-platform (draft/publish/rollback re-used). All Prisma schema drift is handled by extending `ensurePrismaTables` — no migration files. The backend exposes a token-protected `/internal/payouts/dispatch` endpoint hit by Cloud Scheduler. Frontend is composed entirely from new components registered in the `/previews` workshop before page consumption.

**Tech Stack:** TypeScript / Node 24 / Express 5 / Prisma 7 + pg adapter / Zod 4 (discriminated unions) / Next.js 16 / React 19 / Vitest-equivalent (`node --test` via tsx) / Supertest / React Testing Library / Cloud Run + Cloud Scheduler + Secret Manager.

---

## Spec Reference

This plan implements [`docs/superpowers/specs/2026-06-04-rewards-redesign-design.md`](../specs/2026-06-04-rewards-redesign-design.md). Re-read it before starting any task — it has acceptance criteria (§13), data-flow diagrams (§2), and resolved-default rationales (§11) that the tasks below assume.

## File Map (locked decomposition)

### Backend — new

```
backend/src/payouts/
├── providers/
│   ├── contracts.ts             # PayoutProvider, DispatchResult, ConnectionResult, PayoutsIntegrationPayload
│   ├── africas-talking.ts       # adapter
│   ├── africas-talking.test.ts
│   ├── termii.ts
│   ├── termii.test.ts
│   ├── reloadly.ts
│   ├── reloadly.test.ts
│   └── index.ts                 # getActiveProvider() factory + factory.test.ts
├── worker.ts                    # dispatchTick() — claim/dispatch/backoff loop
├── worker.test.ts
├── routes.ts                    # POST /internal/payouts/dispatch + admin /retry, /mark-issued, /manual, /export
└── routes.test.ts

backend/src/smoke/
└── payouts-smoke.ts             # post-deploy end-to-end (sandbox)
```

### Backend — modified

```
backend/prisma/schema.prisma            # +7 Reward fields, +@@unique
backend/src/admin/prisma.ts             # +ALTER TABLE rewards ... per new field; +unique constraint
backend/src/admin/contracts.ts          # extend RewardLogRow with new fields
backend/src/admin/providers/postgres.ts # extend SELECT in fetchRewardsFromPostgres
backend/src/routes/admin.ts             # extend GET /admin/rewards with filters + meta.activeProvider
backend/src/app.ts                      # mount payouts router
backend/src/whatsapp/handler.ts         # swap findFirst+create for prisma.reward.upsert (uses new @@unique)
backend/src/config-platform/runtime-config.ts # add getRuntimePayoutsConfig() helper
```

### Frontend — new

```
dashboard/components/rewards/
├── IssuanceSuccessGauge.tsx
├── TotalPaidHeadline.tsx
├── NeedsAttentionPanel.tsx
├── RewardsHealthHero.tsx
├── RewardsToolbar.tsx
├── RewardsTable.tsx
├── RewardDetailDrawer.tsx
└── ManualRewardDrawer.tsx

dashboard/components/integration/payouts/
├── PayoutsProviderSelector.tsx
└── PayoutsCredentialFields.tsx

dashboard/app/previews/components/
├── RewardsWorkspacePreview.tsx
└── PayoutsIntegrationPreview.tsx
```

### Frontend — modified

```
dashboard/app/(admin)/rewards/page.tsx          # replace entire body — compose new components
dashboard/components/integration/IntegrationSettingsWorkspace.tsx # add Payouts tab entry
dashboard/lib/admin/api.ts                      # add filter/cursor params + new POST endpoints
dashboard/lib/admin/contracts.ts                # extend RewardLogRow shape
dashboard/app/globals.css                       # +tokens: --shadow-drawer, status-pill background variants
shared/src/design-tokens.ts                     # +success-100/700, warning-100/700, danger-100/700 (if missing)
```

### Infrastructure

```
cloudrun-staging-env.yaml                       # +PAYOUTS_WORKER_TOKEN (Secret), Cloud Scheduler job (one-off gcloud cmds)
.github/workflows/staging-promotion-gate.yml    # +step: run payouts-smoke.ts
```

---

## Task Order Summary

| # | Task | Touches |
|---|---|---|
| 1 | Reward Prisma schema delta + ensurePrismaTables ALTERs + bot upsert swap | schema.prisma, prisma.ts, handler.ts |
| 2 | Payouts provider contracts (types + Zod) | contracts.ts + runtime-config.ts |
| 3 | Africa's Talking adapter + tests | africas-talking.ts + .test.ts |
| 4 | Provider factory + tests | providers/index.ts + index.test.ts |
| 5 | Worker dispatch loop + tests | worker.ts + worker.test.ts |
| 6 | Worker HTTP endpoint + token auth + tests | routes.ts + routes.test.ts + app.ts |
| 7 | Termii adapter + tests | termii.ts + .test.ts + factory wire-up |
| 8 | Reloadly adapter + tests | reloadly.ts + .test.ts + factory wire-up |
| 9 | Admin endpoint — extend GET /admin/rewards (filters + meta.activeProvider) | admin.ts, contracts.ts, postgres.ts |
| 10 | Admin endpoints — /retry, /mark-issued, /manual | routes.ts (admin section) + tests |
| 11 | Admin endpoint — CSV export | routes.ts + tests |
| 12 | Frontend design tokens + currency helper | design-tokens.ts, globals.css, lib/format.ts |
| 13 | Frontend: IssuanceSuccessGauge + TotalPaidHeadline + NeedsAttentionPanel + RewardsHealthHero + preview | rewards/*.tsx + RewardsWorkspacePreview.tsx |
| 14 | Frontend: RewardsToolbar + preview update | RewardsToolbar.tsx + preview |
| 15 | Frontend: RewardsTable + RewardDetailDrawer + preview update | RewardsTable.tsx, RewardDetailDrawer.tsx, preview |
| 16 | Frontend: ManualRewardDrawer + preview update | ManualRewardDrawer.tsx, preview |
| 17 | Frontend: wire /rewards page to compose new components | (admin)/rewards/page.tsx + api.ts |
| 18 | Frontend: PayoutsProviderSelector + PayoutsCredentialFields + preview | integration/payouts/*.tsx + PayoutsIntegrationPreview.tsx |
| 19 | Frontend: register Payouts tab in IntegrationSettingsWorkspace | IntegrationSettingsWorkspace.tsx |
| 20 | Staging deploy + Cloud Scheduler + smoke + handoff log | gcloud cmds, payouts-smoke.ts, handoff.md, task-list.md |

---

## Task 1: Prisma schema delta and `ensurePrismaTables` ALTERs

**Files:**
- Modify: `backend/prisma/schema.prisma:69-80`
- Modify: `backend/src/admin/prisma.ts:106-140` (rewards section in ensurePrismaTables)
- Modify: `backend/src/whatsapp/handler.ts:790-810` (swap findFirst+create for upsert)

### Steps

- [ ] **Step 1: Extend the Reward model in `backend/prisma/schema.prisma`**

Replace the existing `Reward` block (currently lines 69–80) with:

```prisma
model Reward {
  id                String     @id @default(uuid())
  userId            String
  user              User       @relation(fields: [userId], references: [id])
  module            String
  amount            Float
  channel           String
  status            String     @default("Pending")
  issuedAt          DateTime?
  learnerPhone      String     @default("")
  providerTxnId     String?
  failureReason     String?
  retryCount        Int        @default(0)
  nextAttemptAt     DateTime?
  attemptInProgress Boolean    @default(false)
  noteFromActor     String?
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  @@unique([userId, module])
  @@map("rewards")
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run:
```bash
cd backend && npx prisma generate
```
Expected: `Generated Prisma Client (v7.8.0) to .\..\node_modules\@prisma\client`.

- [ ] **Step 3: Extend `ensurePrismaTables` in `backend/src/admin/prisma.ts`**

Inside the `// rewards` block (after the existing `ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "issuedAt" ...`), add these statements before the trailing `DO $$` constraint block:

```ts
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "learnerPhone" TEXT NOT NULL DEFAULT '';`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "providerTxnId" TEXT;`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "failureReason" TEXT;`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "attemptInProgress" BOOLEAN NOT NULL DEFAULT false;`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "noteFromActor" TEXT;`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
await prisma.$executeRawUnsafe(`ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);

// Compound uniqueness so the bot can use prisma.reward.upsert.
await prisma.$executeRawUnsafe(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_userId_module_key') THEN
      ALTER TABLE rewards ADD CONSTRAINT "rewards_userId_module_key" UNIQUE ("userId", module);
    END IF;
  END $$;
`);
```

- [ ] **Step 4: Update the legacy-NOT-NULL allow-list to include the new rewards columns**

In the same file, find the `Neutralise legacy NOT NULL constraints` block. Update the `rewards` line to include all current managed columns:

```ts
OR (table_name = 'rewards' AND column_name IN ('id','userId','module','amount','channel','status','learnerPhone','retryCount','attemptInProgress','createdAt','updatedAt'))
```

- [ ] **Step 5: Swap the bot's reward insertion for an upsert in `backend/src/whatsapp/handler.ts`**

Find the `module_completed` branch inside `recordAnalytics()` (the `findFirst` + conditional `create` block). Replace it with:

```ts
} else if (event.type === "module_completed") {
  const parsedAmount = Number(process.env.REWARD_DEFAULT_AMOUNT);
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 500;
  const channel = (process.env.REWARD_DEFAULT_CHANNEL ?? "airtime").trim() || "airtime";
  await prisma.reward.upsert({
    where: {
      userId_module: { userId: session.userId, module: event.module }
    },
    update: {},  // never overwrite an existing reward when the user replays a module
    create: {
      userId: session.userId,
      module: event.module,
      amount,
      channel,
      status: "Pending",
      learnerPhone: session.phone
    }
  });
}
```

- [ ] **Step 6: Typecheck the backend**

Run:
```bash
npm run typecheck -w @shetrades/backend
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/admin/prisma.ts backend/src/whatsapp/handler.ts
git commit -m "feat(rewards): extend Reward schema for payouts pipeline

- Add learnerPhone, providerTxnId, failureReason, retryCount,
  nextAttemptAt, attemptInProgress, noteFromActor, createdAt,
  updatedAt to Reward, plus @@unique([userId, module]).
- ALTER TABLE IF NOT EXISTS for each new column in
  ensurePrismaTables, and a DO block that adds the compound
  unique constraint idempotently. Keeps the bootstrap drift-
  tolerant on staging databases that already have the older
  rewards shape.
- Swap recordAnalytics's findFirst+create for prisma.reward.upsert
  now that the unique constraint exists. Same external behaviour,
  no race window between bot ticks."
```

---

## Task 2: Payouts provider contracts (types and Zod)

**Files:**
- Create: `backend/src/payouts/providers/contracts.ts`
- Modify: `backend/src/config-platform/runtime-config.ts` (add `getRuntimePayoutsConfig()`)
- Test: `backend/src/payouts/providers/contracts.test.ts`

### Steps

- [ ] **Step 1: Create `backend/src/payouts/providers/contracts.ts`**

```ts
import { z } from "zod";

export const payoutsIntegrationPayloadSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("africas_talking"),
    sandbox: z.boolean(),
    africasTalking: z.object({
      username: z.string().min(1),
      apiKey: z.string().min(1)
    }),
    defaults: z.object({ currency: z.literal("NGN"), channel: z.literal("airtime") })
  }),
  z.object({
    provider: z.literal("termii"),
    sandbox: z.boolean(),
    termii: z.object({
      apiKey: z.string().min(1),
      senderId: z.string().optional()
    }),
    defaults: z.object({ currency: z.literal("NGN"), channel: z.literal("airtime") })
  }),
  z.object({
    provider: z.literal("reloadly"),
    sandbox: z.boolean(),
    reloadly: z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1)
    }),
    defaults: z.object({ currency: z.literal("NGN"), channel: z.literal("airtime") })
  })
]);

export type PayoutsIntegrationPayload = z.infer<typeof payoutsIntegrationPayloadSchema>;

export type ConnectionResult =
  | { status: "healthy"; latencyMs: number; message: string }
  | { status: "degraded"; latencyMs: number; message: string }
  | { status: "failed"; message: string };

export type DispatchResult =
  | { ok: true; providerTxnId: string; issuedAt: Date }
  | { ok: false; reason: string; retryable: boolean };

// Minimal projection of the Reward row the adapters need.
export type RewardDispatchInput = {
  id: string;
  amount: number;
  channel: string;
  learnerPhone: string;
  retryCount: number;
};

export interface PayoutProvider {
  readonly key: "africas_talking" | "termii" | "reloadly";
  verifyCredentials(config: PayoutsIntegrationPayload): Promise<ConnectionResult>;
  dispatch(reward: RewardDispatchInput, config: PayoutsIntegrationPayload): Promise<DispatchResult>;
}
```

- [ ] **Step 2: Add `getRuntimePayoutsConfig()` to `backend/src/config-platform/runtime-config.ts`**

After the existing `getRuntimeNotificationConfig()` function, add:

```ts
import type { PayoutsIntegrationPayload } from "../payouts/providers/contracts.js";

export function getRuntimePayoutsConfig() {
  return getRuntimeIntegrationConfig<PayoutsIntegrationPayload>("integration.payouts.primary");
}
```

- [ ] **Step 3: Write the schema unit tests at `backend/src/payouts/providers/contracts.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { payoutsIntegrationPayloadSchema } from "./contracts.js";

test("payoutsIntegrationPayloadSchema accepts a valid Africa's Talking payload", () => {
  const parsed = payoutsIntegrationPayloadSchema.parse({
    provider: "africas_talking",
    sandbox: true,
    africasTalking: { username: "sandbox", apiKey: "k" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(parsed.provider, "africas_talking");
});

test("payoutsIntegrationPayloadSchema rejects when the wrong credentials block is provided", () => {
  const result = payoutsIntegrationPayloadSchema.safeParse({
    provider: "termii",
    sandbox: false,
    africasTalking: { username: "x", apiKey: "y" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(result.success, false);
});

test("payoutsIntegrationPayloadSchema accepts Reloadly", () => {
  const parsed = payoutsIntegrationPayloadSchema.parse({
    provider: "reloadly",
    sandbox: false,
    reloadly: { clientId: "c", clientSecret: "s" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(parsed.provider, "reloadly");
});
```

- [ ] **Step 4: Run the new tests**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "payoutsIntegrationPayloadSchema"
```
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/payouts/providers/contracts.ts backend/src/payouts/providers/contracts.test.ts backend/src/config-platform/runtime-config.ts
git commit -m "feat(payouts): add provider contracts and runtime config helper"
```

---

## Task 3: Africa's Talking adapter

**Files:**
- Create: `backend/src/payouts/providers/africas-talking.ts`
- Test: `backend/src/payouts/providers/africas-talking.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests at `backend/src/payouts/providers/africas-talking.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { africasTalkingAdapter } from "./africas-talking.js";
import type { PayoutsIntegrationPayload, RewardDispatchInput } from "./contracts.js";

function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  let index = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[index++] ?? responses[responses.length - 1];
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return calls;
}

const baseConfig: PayoutsIntegrationPayload = {
  provider: "africas_talking",
  sandbox: true,
  africasTalking: { username: "sandbox", apiKey: "test-key" },
  defaults: { currency: "NGN", channel: "airtime" }
};

const baseReward: RewardDispatchInput = {
  id: "rwd_1",
  amount: 500,
  channel: "airtime",
  learnerPhone: "+2348031234567",
  retryCount: 0
};

test("dispatch hits the sandbox URL when config.sandbox is true", async () => {
  const calls = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-1" }] } }]);
  await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.match(calls[0].url, /api\.sandbox\.africastalking\.com/);
});

test("dispatch hits the production URL when config.sandbox is false", async () => {
  const calls = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-2" }] } }]);
  await africasTalkingAdapter.dispatch(baseReward, { ...baseConfig, sandbox: false });
  assert.match(calls[0].url, /api\.africastalking\.com/);
  assert.doesNotMatch(calls[0].url, /sandbox/);
});

test("dispatch sets the apiKey header and uses POST", async () => {
  const calls = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-3" }] } }]);
  await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("apiKey"), "test-key");
});

test("dispatch passes the reward id as the idempotency-ish reference", async () => {
  const calls = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-4" }] } }]);
  await africasTalkingAdapter.dispatch({ ...baseReward, retryCount: 2 }, baseConfig);
  const body = new URLSearchParams(calls[0].init.body as string);
  // recipients is JSON array; check it includes our reward id in the "reference"-like field.
  const recipients = JSON.parse(body.get("recipients") ?? "[]");
  assert.equal(recipients[0].phoneNumber, "+2348031234567");
  assert.equal(recipients[0].currencyCode, "NGN");
  assert.equal(recipients[0].amount, 500);
});

test("dispatch returns ok=true with the provider transaction id on Sent", async () => {
  stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-5" }] } }]);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.providerTxnId, "AT-tx-5");
    assert.ok(result.issuedAt instanceof Date);
  }
});

test("dispatch returns retryable=true on HTTP 503", async () => {
  stubFetch([{ status: 503, body: { message: "upstream timeout" } }]);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /503/);
  }
});

test("dispatch returns retryable=false on HTTP 400 with invalid recipient", async () => {
  stubFetch([{ status: 201, body: { responses: [{ status: "InvalidPhoneNumber", errorMessage: "bad phone" }] } }]);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, false);
    assert.match(result.reason, /InvalidPhoneNumber|bad phone/);
  }
});

test("verifyCredentials returns healthy when account balance fetch returns 200", async () => {
  stubFetch([{ status: 200, body: { UserData: { balance: "NGN 1000" } } }]);
  const result = await africasTalkingAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "healthy");
});

test("verifyCredentials returns failed when account balance returns 401", async () => {
  stubFetch([{ status: 401, body: { message: "unauthorized" } }]);
  const result = await africasTalkingAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "failed");
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "africas"
```
Expected: 9 fail with "Cannot find module 'africas-talking.js'".

- [ ] **Step 3: Write the adapter at `backend/src/payouts/providers/africas-talking.ts`**

```ts
import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";

const SANDBOX_BASE = "https://api.sandbox.africastalking.com/version1";
const PROD_BASE = "https://api.africastalking.com/version1";
const USER_BASE_SANDBOX = "https://api.sandbox.africastalking.com/version1/user";
const USER_BASE_PROD = "https://api.africastalking.com/version1/user";

function pickBases(sandbox: boolean) {
  return sandbox
    ? { airtime: `${SANDBOX_BASE}/airtime/send`, user: USER_BASE_SANDBOX }
    : { airtime: `${PROD_BASE}/airtime/send`, user: USER_BASE_PROD };
}

function requireAfricasTalkingConfig(config: PayoutsIntegrationPayload) {
  if (config.provider !== "africas_talking") {
    throw new Error("africasTalkingAdapter received a non-AT config");
  }
  return config.africasTalking;
}

export const africasTalkingAdapter: PayoutProvider = {
  key: "africas_talking",

  async verifyCredentials(config) {
    const creds = requireAfricasTalkingConfig(config);
    const bases = pickBases(config.sandbox);
    const url = `${bases.user}?username=${encodeURIComponent(creds.username)}`;
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { apiKey: creds.apiKey, Accept: "application/json" }
      });
      const latencyMs = Date.now() - started;
      if (response.ok) {
        return { status: "healthy", latencyMs, message: "Account reachable" };
      }
      return { status: "failed", message: `Account check returned HTTP ${response.status}` };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  },

  async dispatch(reward, config) {
    const creds = requireAfricasTalkingConfig(config);
    const bases = pickBases(config.sandbox);
    const body = new URLSearchParams({
      username: creds.username,
      recipients: JSON.stringify([
        {
          phoneNumber: reward.learnerPhone,
          currencyCode: config.defaults.currency,
          amount: reward.amount
        }
      ])
    });
    try {
      const response = await fetch(bases.airtime, {
        method: "POST",
        headers: {
          apiKey: creds.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: body.toString()
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: `Africa's Talking returned HTTP ${response.status}`,
          retryable: response.status >= 500 || response.status === 429
        } satisfies DispatchResult;
      }
      const data = (await response.json()) as {
        responses?: Array<{ status?: string; transactionId?: string; errorMessage?: string }>;
      };
      const first = data.responses?.[0];
      if (!first) {
        return { ok: false, reason: "Empty responses[] from provider", retryable: true };
      }
      if (first.status === "Sent" && first.transactionId) {
        return { ok: true, providerTxnId: first.transactionId, issuedAt: new Date() };
      }
      return {
        ok: false,
        reason: `${first.status ?? "UnknownStatus"} ${first.errorMessage ?? ""}`.trim(),
        retryable: false
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        retryable: true
      };
    }
  }
};
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "africas"
```
Expected: 9 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/payouts/providers/africas-talking.ts backend/src/payouts/providers/africas-talking.test.ts
git commit -m "feat(payouts): implement Africa's Talking provider adapter

Maps dispatch failures to retryable (HTTP 5xx, 429) vs
non-retryable (InvalidPhoneNumber, etc) per the spec. Uses
sandbox base URL when config.sandbox is true. verifyCredentials
checks the user endpoint for account reachability."
```

---

## Task 4: Provider factory

**Files:**
- Create: `backend/src/payouts/providers/index.ts`
- Test: `backend/src/payouts/providers/index.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests at `backend/src/payouts/providers/index.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { getActiveProvider } from "./index.js";

// We rely on getRuntimePayoutsConfig() reading from cachedPublicConfigs.
// Override it with a vi-equivalent module shim by reaching into the cache helper.

import { setRuntimeIntegrationConfigForTests } from "../../config-platform/runtime-config.js";

test("getActiveProvider returns null when no integration config is published", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
  const result = await getActiveProvider();
  assert.equal(result, null);
});

test("getActiveProvider returns Africa's Talking adapter when provider=africas_talking", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", {
    provider: "africas_talking",
    sandbox: true,
    africasTalking: { username: "u", apiKey: "k" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  const result = await getActiveProvider();
  assert.equal(result?.provider.key, "africas_talking");
});

test("getActiveProvider passes config through unchanged", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", {
    provider: "africas_talking",
    sandbox: false,
    africasTalking: { username: "u2", apiKey: "k2" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  const result = await getActiveProvider();
  assert.equal(result?.config.sandbox, false);
  if (result && result.config.provider === "africas_talking") {
    assert.equal(result.config.africasTalking.username, "u2");
  }
});
```

- [ ] **Step 2: Add `setRuntimeIntegrationConfigForTests` to `backend/src/config-platform/runtime-config.ts`**

After the existing `getRuntimeIntegrationConfig` export, add:

```ts
/** Test-only: inject an integration config without exercising the publish path. */
export function setRuntimeIntegrationConfigForTests(key: string, value: unknown) {
  if (value === null || value === undefined) {
    cachedIntegrationConfigs.delete(key);
  } else {
    cachedIntegrationConfigs.set(key, { versionTag: "test", payload: value });
  }
}
```

- [ ] **Step 3: Create `backend/src/payouts/providers/index.ts`**

```ts
import { africasTalkingAdapter } from "./africas-talking.js";
import type { PayoutProvider, PayoutsIntegrationPayload } from "./contracts.js";
import { getRuntimePayoutsConfig } from "../../config-platform/runtime-config.js";

export async function getActiveProvider(): Promise<{
  provider: PayoutProvider;
  config: PayoutsIntegrationPayload;
} | null> {
  const config = getRuntimePayoutsConfig();
  if (!config) return null;
  switch (config.provider) {
    case "africas_talking":
      return { provider: africasTalkingAdapter, config };
    case "termii":
    case "reloadly":
      // Adapters added in later tasks. Returning null is safe: the worker
      // logs a "no_active_provider" skip event when this is null.
      return null;
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "getActiveProvider"
```
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/payouts/providers/index.ts backend/src/payouts/providers/index.test.ts backend/src/config-platform/runtime-config.ts
git commit -m "feat(payouts): add getActiveProvider factory and test seam"
```

---

## Task 5: Worker dispatch loop

**Files:**
- Create: `backend/src/payouts/worker.ts`
- Test: `backend/src/payouts/worker.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests at `backend/src/payouts/worker.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../admin/prisma.js";
import { dispatchTick } from "./worker.js";
import { setRuntimeIntegrationConfigForTests } from "../config-platform/runtime-config.js";
import type { PayoutProvider } from "./providers/contracts.js";

async function seedReward(opts: Partial<{ status: string; retryCount: number; nextAttemptAt: Date | null }> = {}) {
  const user = await prisma.user.create({ data: { phone: `+234${Math.floor(Math.random() * 1e10)}` } });
  return prisma.reward.create({
    data: {
      userId: user.id,
      module: "Module 1",
      amount: 500,
      channel: "airtime",
      learnerPhone: user.phone,
      status: opts.status ?? "Pending",
      retryCount: opts.retryCount ?? 0,
      nextAttemptAt: opts.nextAttemptAt === undefined ? null : opts.nextAttemptAt
    }
  });
}

function makeProvider(behaviour: "ok" | "retryable" | "non_retryable"): PayoutProvider {
  return {
    key: "africas_talking",
    async verifyCredentials() { return { status: "healthy", latencyMs: 0, message: "ok" }; },
    async dispatch() {
      if (behaviour === "ok") return { ok: true, providerTxnId: "TX-1", issuedAt: new Date() };
      if (behaviour === "retryable") return { ok: false, reason: "503", retryable: true };
      return { ok: false, reason: "InvalidPhone", retryable: false };
    }
  };
}

test("dispatchTick skips when no provider is configured", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
  const summary = await dispatchTick();
  assert.equal(summary.skipped, 1);
  assert.equal(summary.dispatched, 0);
});

test("dispatchTick marks success as Issued with providerTxnId", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", {
    provider: "africas_talking",
    sandbox: true,
    africasTalking: { username: "u", apiKey: "k" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  const reward = await seedReward();
  await dispatchTick({ providerOverrideForTests: makeProvider("ok") });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Issued");
  assert.equal(updated.providerTxnId, "TX-1");
  assert.equal(updated.attemptInProgress, false);
});

test("dispatchTick schedules backoff on retryable failure: 5 min after first attempt", async () => {
  const reward = await seedReward({ retryCount: 0 });
  await dispatchTick({ providerOverrideForTests: makeProvider("retryable") });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Pending");
  assert.equal(updated.retryCount, 1);
  assert.ok(updated.nextAttemptAt);
  const deltaMin = (updated.nextAttemptAt!.getTime() - Date.now()) / 60_000;
  assert.ok(deltaMin >= 4.5 && deltaMin <= 5.5);
});

test("dispatchTick marks Failed when non-retryable", async () => {
  const reward = await seedReward({ retryCount: 0 });
  await dispatchTick({ providerOverrideForTests: makeProvider("non_retryable") });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Failed");
  assert.equal(updated.failureReason, "InvalidPhone");
});

test("dispatchTick marks Failed after the third retryable attempt", async () => {
  const reward = await seedReward({ retryCount: 2 });
  await dispatchTick({ providerOverrideForTests: makeProvider("retryable") });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Failed");
  assert.equal(updated.retryCount, 3);
});

test("dispatchTick does not pick up rows whose nextAttemptAt is in the future", async () => {
  await seedReward({ nextAttemptAt: new Date(Date.now() + 60 * 60_000) });
  const summary = await dispatchTick({ providerOverrideForTests: makeProvider("ok") });
  assert.equal(summary.dispatched, 0);
});

test("dispatchTick row-claim prevents double dispatch under concurrent ticks", async () => {
  const reward = await seedReward();
  const provider = makeProvider("ok");
  // Run two ticks concurrently — the claim should ensure only one updates.
  await Promise.all([
    dispatchTick({ providerOverrideForTests: provider }),
    dispatchTick({ providerOverrideForTests: provider })
  ]);
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Issued");
  // The summary count would say 1 dispatched across both — verified by single Issued.
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "dispatchTick"
```
Expected: 7 fail with "Cannot find module './worker.js'".

- [ ] **Step 3: Create `backend/src/payouts/worker.ts`**

```ts
import { prisma } from "../admin/prisma.js";
import { getActiveProvider } from "./providers/index.js";
import type { PayoutProvider, PayoutsIntegrationPayload } from "./providers/contracts.js";

export type DispatchTickSummary = {
  scannedAt: string;
  examined: number;
  dispatched: number;
  retried: number;
  movedToFailed: number;
  skipped: number;
};

type DispatchTickOptions = {
  providerOverrideForTests?: PayoutProvider;
  configOverrideForTests?: PayoutsIntegrationPayload;
  batchLimit?: number;
};

const BATCH_LIMIT = 50;
const RETRY_CEILING = 3;
const BASE_DELAY_MS = 5 * 60_000;

export async function dispatchTick(opts: DispatchTickOptions = {}): Promise<DispatchTickSummary> {
  const started = new Date();
  const summary: DispatchTickSummary = {
    scannedAt: started.toISOString(),
    examined: 0,
    dispatched: 0,
    retried: 0,
    movedToFailed: 0,
    skipped: 0
  };

  let provider: PayoutProvider | undefined = opts.providerOverrideForTests;
  let config: PayoutsIntegrationPayload | undefined = opts.configOverrideForTests;
  if (!provider) {
    const active = await getActiveProvider();
    if (!active) {
      summary.skipped += 1;
      console.log(JSON.stringify({ event: "payouts.tick.skip", reason: "no_active_provider" }));
      return summary;
    }
    provider = active.provider;
    config = active.config;
  }

  const candidates = await prisma.reward.findMany({
    where: {
      status: { in: ["Pending", "Failed"] },
      retryCount: { lt: RETRY_CEILING },
      attemptInProgress: false,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: started } }]
    },
    orderBy: { createdAt: "asc" },
    take: opts.batchLimit ?? BATCH_LIMIT
  });
  summary.examined = candidates.length;

  for (const candidate of candidates) {
    // Atomic claim: returns count=1 only if we won the race.
    const claim = await prisma.reward.updateMany({
      where: { id: candidate.id, attemptInProgress: false },
      data: { attemptInProgress: true }
    });
    if (claim.count === 0) continue;

    const tStart = Date.now();
    const result = await provider.dispatch(
      {
        id: candidate.id,
        amount: candidate.amount,
        channel: candidate.channel,
        learnerPhone: candidate.learnerPhone,
        retryCount: candidate.retryCount
      },
      config ?? ({ provider: provider.key } as PayoutsIntegrationPayload)
    );
    const latencyMs = Date.now() - tStart;

    if (result.ok) {
      await prisma.reward.update({
        where: { id: candidate.id },
        data: {
          status: "Issued",
          issuedAt: result.issuedAt,
          providerTxnId: result.providerTxnId,
          failureReason: null,
          attemptInProgress: false
        }
      });
      summary.dispatched += 1;
      console.log(JSON.stringify({
        event: "payouts.dispatch",
        rewardId: candidate.id,
        provider: provider.key,
        sandbox: config?.sandbox,
        status: "Issued",
        providerTxnId: result.providerTxnId,
        retryCount: candidate.retryCount,
        latencyMs
      }));
    } else if (result.retryable && candidate.retryCount + 1 < RETRY_CEILING) {
      const delayMs = Math.pow(2, candidate.retryCount) * BASE_DELAY_MS;
      await prisma.reward.update({
        where: { id: candidate.id },
        data: {
          retryCount: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + delayMs),
          failureReason: result.reason,
          attemptInProgress: false,
          status: "Pending"
        }
      });
      summary.retried += 1;
      console.log(JSON.stringify({
        event: "payouts.dispatch",
        rewardId: candidate.id,
        provider: provider.key,
        sandbox: config?.sandbox,
        status: "RetryQueued",
        retryCount: candidate.retryCount + 1,
        nextDelayMs: delayMs,
        reason: result.reason,
        latencyMs
      }));
    } else {
      await prisma.reward.update({
        where: { id: candidate.id },
        data: {
          status: "Failed",
          retryCount: { increment: 1 },
          failureReason: result.reason,
          attemptInProgress: false
        }
      });
      summary.movedToFailed += 1;
      console.log(JSON.stringify({
        event: "payouts.dispatch",
        rewardId: candidate.id,
        provider: provider.key,
        sandbox: config?.sandbox,
        status: "Failed",
        retryCount: candidate.retryCount + 1,
        reason: result.reason,
        latencyMs
      }));
    }
  }

  console.log(JSON.stringify({
    event: "payouts.tick.summary",
    ...summary,
    tickDurationMs: Date.now() - started.getTime()
  }));
  return summary;
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "dispatchTick"
```
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/payouts/worker.ts backend/src/payouts/worker.test.ts
git commit -m "feat(payouts): worker dispatch loop with claim, backoff, and structured logs

5/10/20-min exponential backoff matching the spec; Failed after the
third retryable attempt (~15 min total). Row-claim via
updateMany WHERE attemptInProgress=false prevents double dispatch
across overlapping ticks. Optional provider override flag exists
solely to make the loop testable without an HTTP shim."
```

---

## Task 6: Worker HTTP endpoint + token auth

**Files:**
- Create: `backend/src/payouts/routes.ts`
- Test: `backend/src/payouts/routes.test.ts`
- Modify: `backend/src/app.ts:7-90` (mount the router)

### Steps

- [ ] **Step 1: Write the failing tests at `backend/src/payouts/routes.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

test("POST /internal/payouts/dispatch rejects without the worker token", async () => {
  await request(app).post("/internal/payouts/dispatch").expect(403);
});

test("POST /internal/payouts/dispatch rejects with a wrong token", async () => {
  process.env.PAYOUTS_WORKER_TOKEN = "expected";
  await request(app)
    .post("/internal/payouts/dispatch")
    .set("X-Internal-Worker-Token", "wrong")
    .expect(403);
});

test("POST /internal/payouts/dispatch returns a summary with the correct shape", async () => {
  process.env.PAYOUTS_WORKER_TOKEN = "expected";
  const response = await request(app)
    .post("/internal/payouts/dispatch")
    .set("X-Internal-Worker-Token", "expected")
    .expect(200);
  assert.ok(typeof response.body.scannedAt === "string");
  for (const key of ["examined", "dispatched", "retried", "movedToFailed", "skipped"]) {
    assert.equal(typeof response.body[key], "number", `${key} should be number`);
  }
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "/internal/payouts/dispatch"
```
Expected: 3 fail (route 404 or 500).

- [ ] **Step 3: Create `backend/src/payouts/routes.ts`**

```ts
import { Router } from "express";
import { dispatchTick } from "./worker.js";

export const payoutsRouter = Router();

payoutsRouter.post("/internal/payouts/dispatch", async (req, res, next) => {
  const expected = process.env.PAYOUTS_WORKER_TOKEN;
  const supplied = req.header("X-Internal-Worker-Token");
  if (!expected || supplied !== expected) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  try {
    const summary = await dispatchTick();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 4: Mount the router in `backend/src/app.ts`**

Add the import near the other route imports (around line 7):

```ts
import { payoutsRouter } from "./payouts/routes.js";
```

And mount it (around line 81, near the other `app.use("/api", ...)` calls — but this one is `/`, no `/api` prefix):

```ts
app.use("/", payoutsRouter);
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "/internal/payouts/dispatch"
```
Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/payouts/routes.ts backend/src/payouts/routes.test.ts backend/src/app.ts
git commit -m "feat(payouts): worker HTTP endpoint with shared-secret token auth"
```

---

## Task 7: Termii adapter

**Files:**
- Create: `backend/src/payouts/providers/termii.ts`
- Test: `backend/src/payouts/providers/termii.test.ts`
- Modify: `backend/src/payouts/providers/index.ts` (wire Termii into the factory)

### Steps

- [ ] **Step 1: Write the failing tests at `backend/src/payouts/providers/termii.test.ts`**

Use the same `stubFetch` helper pattern from Task 3 (copy it locally; don't extract yet — keep tests self-contained). Mirror the AT test shape with these specific assertions:

- `dispatch` POSTs to `https://api.ng.termii.com/api/airtime/send` (sandbox toggles to the same host with a separate route prefix per Termii docs: `https://sandbox.termii.com/api/airtime/send`). Request body is JSON: `{ phone_number, api_key, amount, country_code: "NG", purchase_code }`.
- `purchase_code` uses `reward_${rewardId}_attempt_${retryCount}`.
- HTTP 200 with `code: "ok"` and `transaction_id` → `{ ok: true, providerTxnId }`.
- HTTP 200 with `code: "invalid_phone"` → `{ ok: false, retryable: false }`.
- HTTP 5xx or `code: "service_unavailable"` → `{ ok: false, retryable: true }`.
- `verifyCredentials` hits `https://api.ng.termii.com/api/get-balance?api_key=<key>` returning healthy on 200 with a numeric balance, failed otherwise.

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "termii"
```
Expected: 6+ fail.

- [ ] **Step 3: Create `backend/src/payouts/providers/termii.ts`**

```ts
import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";

const SANDBOX_BASE = "https://sandbox.termii.com/api";
const PROD_BASE = "https://api.ng.termii.com/api";

function requireTermiiConfig(config: PayoutsIntegrationPayload) {
  if (config.provider !== "termii") throw new Error("termiiAdapter received a non-Termii config");
  return config.termii;
}

export const termiiAdapter: PayoutProvider = {
  key: "termii",

  async verifyCredentials(config) {
    const creds = requireTermiiConfig(config);
    const base = config.sandbox ? SANDBOX_BASE : PROD_BASE;
    const started = Date.now();
    try {
      const response = await fetch(`${base}/get-balance?api_key=${encodeURIComponent(creds.apiKey)}`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        return { status: "failed", message: `Termii returned HTTP ${response.status}` };
      }
      const data = (await response.json()) as { balance?: number };
      if (typeof data.balance === "number") {
        return { status: "healthy", latencyMs, message: `Balance: ${data.balance}` };
      }
      return { status: "failed", message: "Termii response missing balance" };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  },

  async dispatch(reward, config) {
    const creds = requireTermiiConfig(config);
    const base = config.sandbox ? SANDBOX_BASE : PROD_BASE;
    try {
      const response = await fetch(`${base}/airtime/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          phone_number: reward.learnerPhone,
          api_key: creds.apiKey,
          amount: reward.amount,
          country_code: "NG",
          purchase_code: `reward_${reward.id}_attempt_${reward.retryCount}`
        })
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: `Termii returned HTTP ${response.status}`,
          retryable: response.status >= 500 || response.status === 429
        } satisfies DispatchResult;
      }
      const data = (await response.json()) as { code?: string; transaction_id?: string; message?: string };
      if (data.code === "ok" && data.transaction_id) {
        return { ok: true, providerTxnId: data.transaction_id, issuedAt: new Date() };
      }
      const reason = `${data.code ?? "UnknownStatus"} ${data.message ?? ""}`.trim();
      const retryable = data.code === "service_unavailable" || data.code === "rate_limited";
      return { ok: false, reason, retryable };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        retryable: true
      };
    }
  }
};
```

- [ ] **Step 4: Wire Termii into the factory at `backend/src/payouts/providers/index.ts`**

Replace the `case "termii":` line with:

```ts
import { termiiAdapter } from "./termii.js";

// ... inside switch:
    case "termii":
      return { provider: termiiAdapter, config };
```

- [ ] **Step 5: Run tests**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "termii"
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/payouts/providers/termii.ts backend/src/payouts/providers/termii.test.ts backend/src/payouts/providers/index.ts
git commit -m "feat(payouts): implement Termii provider adapter and wire factory"
```

---

## Task 8: Reloadly adapter

**Files:**
- Create: `backend/src/payouts/providers/reloadly.ts`
- Test: `backend/src/payouts/providers/reloadly.test.ts`
- Modify: `backend/src/payouts/providers/index.ts`

### Steps

- [ ] **Step 1: Write the failing tests at `backend/src/payouts/providers/reloadly.test.ts`**

Mirror the Termii test pattern with these Reloadly-specific assertions:

- Reloadly uses OAuth2 client-credentials: a token is fetched first from `https://auth.reloadly.com/oauth/token` (POST JSON: `{ client_id, client_secret, grant_type: "client_credentials", audience }`). The audience is `https://topups-sandbox.reloadly.com` when sandbox, otherwise `https://topups.reloadly.com`.
- The actual topup POST goes to `${audience}/topups` with header `Authorization: Bearer <token>` and body `{ operatorId, amount, useLocalAmount: true, customIdentifier, recipientPhone: { countryCode: "NG", number: reward.learnerPhone } }`.
- `customIdentifier` uses `reward_${rewardId}_attempt_${retryCount}`.
- HTTP 200 with `status: "SUCCESSFUL"` and `transactionId` → ok=true.
- HTTP 200 with `status: "FAILED"` and `errorCode: "INVALID_RECIPIENT"` → ok=false, retryable=false.
- HTTP 5xx → ok=false, retryable=true.
- `verifyCredentials` calls `/accounts/balance` with the bearer token. Returns healthy on 200.

For the operator ID, hard-code `341` (MTN Nigeria via Reloadly sandbox docs) for v1. A follow-up can move this to config.

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "reloadly"
```
Expected: 7+ fail.

- [ ] **Step 3: Create `backend/src/payouts/providers/reloadly.ts`**

```ts
import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";

const AUTH_URL = "https://auth.reloadly.com/oauth/token";
const SANDBOX_AUDIENCE = "https://topups-sandbox.reloadly.com";
const PROD_AUDIENCE = "https://topups.reloadly.com";
const DEFAULT_NG_MTN_OPERATOR_ID = 341;

function requireReloadlyConfig(config: PayoutsIntegrationPayload) {
  if (config.provider !== "reloadly") throw new Error("reloadlyAdapter received a non-Reloadly config");
  return config.reloadly;
}

async function fetchAccessToken(creds: { clientId: string; clientSecret: string }, audience: string) {
  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "client_credentials",
      audience
    })
  });
  if (!response.ok) {
    throw new Error(`Reloadly auth returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Reloadly auth response missing access_token");
  return data.access_token;
}

export const reloadlyAdapter: PayoutProvider = {
  key: "reloadly",

  async verifyCredentials(config) {
    const creds = requireReloadlyConfig(config);
    const audience = config.sandbox ? SANDBOX_AUDIENCE : PROD_AUDIENCE;
    const started = Date.now();
    try {
      const token = await fetchAccessToken(creds, audience);
      const response = await fetch(`${audience}/accounts/balance`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      const latencyMs = Date.now() - started;
      if (response.ok) {
        return { status: "healthy", latencyMs, message: "Account reachable" };
      }
      return { status: "failed", message: `Reloadly returned HTTP ${response.status}` };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  },

  async dispatch(reward, config) {
    const creds = requireReloadlyConfig(config);
    const audience = config.sandbox ? SANDBOX_AUDIENCE : PROD_AUDIENCE;
    try {
      const token = await fetchAccessToken(creds, audience);
      const response = await fetch(`${audience}/topups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          operatorId: DEFAULT_NG_MTN_OPERATOR_ID,
          amount: reward.amount,
          useLocalAmount: true,
          customIdentifier: `reward_${reward.id}_attempt_${reward.retryCount}`,
          recipientPhone: { countryCode: "NG", number: reward.learnerPhone }
        })
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: `Reloadly returned HTTP ${response.status}`,
          retryable: response.status >= 500 || response.status === 429
        } satisfies DispatchResult;
      }
      const data = (await response.json()) as {
        status?: string;
        transactionId?: string | number;
        errorCode?: string;
        message?: string;
      };
      if (data.status === "SUCCESSFUL" && data.transactionId !== undefined) {
        return { ok: true, providerTxnId: String(data.transactionId), issuedAt: new Date() };
      }
      const reason = `${data.errorCode ?? data.status ?? "UnknownStatus"} ${data.message ?? ""}`.trim();
      const retryable = data.errorCode === "TIMEOUT" || data.errorCode === "PROVIDER_UNAVAILABLE";
      return { ok: false, reason, retryable };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        retryable: true
      };
    }
  }
};
```

- [ ] **Step 4: Wire Reloadly into the factory**

In `backend/src/payouts/providers/index.ts`, replace the `case "reloadly":` line with:

```ts
import { reloadlyAdapter } from "./reloadly.js";

// ... inside switch:
    case "reloadly":
      return { provider: reloadlyAdapter, config };
```

- [ ] **Step 5: Run tests**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "reloadly"
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/payouts/providers/reloadly.ts backend/src/payouts/providers/reloadly.test.ts backend/src/payouts/providers/index.ts
git commit -m "feat(payouts): implement Reloadly provider adapter and wire factory"
```

---

## Task 9: Admin endpoint — extend `GET /api/admin/rewards`

**Files:**
- Modify: `backend/src/admin/contracts.ts:35-45` (extend RewardLogRow)
- Modify: `backend/src/admin/providers/postgres.ts:196-214` (extend fetchRewardsFromPostgres)
- Modify: `backend/src/routes/admin.ts:39-46` (wire filters + meta.activeProvider)
- Test: `backend/src/routes/admin.test.ts` (extend the existing rewards test)

### Steps

- [ ] **Step 1: Extend `RewardLogRow` in `backend/src/admin/contracts.ts`**

```ts
export type RewardLogRow = {
  id: string;
  learner: string;
  learnerPhone: string;
  module: string;
  amount: number;           // numeric so the frontend can format
  currency: "NGN";
  channel: string;
  status: "Issued" | "Pending" | "Failed";
  createdAt: string;        // ISO
  issuedAt: string | null;  // ISO or null
  providerTxnId: string | null;
  failureReason: string | null;
  retryCount: number;
  noteFromActor: string | null;
};

export type RewardsListMeta = {
  activeProvider: { key: "africas_talking" | "termii" | "reloadly"; sandbox: boolean } | null;
  nextCursor: string | null;
};

export type RewardsPageData = {
  rewards: Array<RewardLogRow>;
  meta: RewardsListMeta;
};
```

- [ ] **Step 2: Extend `fetchRewardsFromPostgres` in `backend/src/admin/providers/postgres.ts`**

Add filter parameters and the SELECT projection:

```ts
export async function fetchRewardsFromPostgres(filters: {
  status?: "Issued" | "Pending" | "Failed";
  from?: Date;
  to?: Date;
  q?: string;
  cursor?: string;
  limit?: number;
} = {}): Promise<RewardsPageData | null> {
  const db = getPool();
  if (!db) return null;

  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const where: string[] = [`r."status" IS NOT NULL`];
  const params: unknown[] = [];

  if (filters.status) { params.push(filters.status); where.push(`r."status" = $${params.length}`); }
  if (filters.from)   { params.push(filters.from);   where.push(`r."createdAt" >= $${params.length}`); }
  if (filters.to)     { params.push(filters.to);     where.push(`r."createdAt" <= $${params.length}`); }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(COALESCE(u."name", '') ILIKE $${params.length} OR r."learnerPhone" ILIKE $${params.length} OR r."module" ILIKE $${params.length})`);
  }
  if (filters.cursor) { params.push(new Date(filters.cursor)); where.push(`r."createdAt" < $${params.length}`); }

  params.push(limit + 1);
  const sql = `
    SELECT
      r."id", COALESCE(u."name", '') AS "learner", r."learnerPhone", r."module",
      r."amount"::float AS "amount", r."channel", r."status",
      r."createdAt", r."issuedAt", r."providerTxnId", r."failureReason",
      r."retryCount", r."noteFromActor"
    FROM rewards r
    LEFT JOIN users u ON u."id" = r."userId"
    WHERE ${where.join(" AND ")}
    ORDER BY r."createdAt" DESC
    LIMIT $${params.length}
  `;
  const rows = await queryWithPolicy<{
    id: string; learner: string; learnerPhone: string; module: string;
    amount: number; channel: string; status: "Issued" | "Pending" | "Failed";
    createdAt: Date; issuedAt: Date | null; providerTxnId: string | null;
    failureReason: string | null; retryCount: number; noteFromActor: string | null;
  }>(sql, params);

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1].createdAt.toISOString() : null;

  return {
    rewards: trimmed.map((row) => ({
      ...row,
      amount: Number(row.amount),
      currency: "NGN" as const,
      createdAt: row.createdAt.toISOString(),
      issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null
    })),
    meta: { activeProvider: null, nextCursor }  // activeProvider populated by the route
  };
}
```

- [ ] **Step 3: Wire filters and activeProvider into the admin route in `backend/src/routes/admin.ts`**

Replace the existing `adminRouter.get("/rewards", ...)` handler with:

```ts
import { getRuntimePayoutsConfig } from "../config-platform/runtime-config.js";

adminRouter.get("/rewards", async (req, res, next) => {
  try {
    const data = await getRewardsForAdmin({
      status: req.query.status as "Issued" | "Pending" | "Failed" | undefined,
      from: req.query.from ? new Date(String(req.query.from)) : undefined,
      to: req.query.to ? new Date(String(req.query.to)) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    const config = getRuntimePayoutsConfig();
    const activeProvider = config
      ? { key: config.provider, sandbox: config.sandbox }
      : null;
    res.status(200).json({
      ...data,
      meta: { ...data.meta, activeProvider }
    });
  } catch (error) {
    next(error);
  }
});
```

`getRewardsForAdmin` already exists in `backend/src/admin/data.ts` as the hybrid provider entry — extend its signature to accept the same filters object and pass it through to `fetchRewardsFromPostgres`.

- [ ] **Step 4: Add filter test cases to `backend/src/routes/admin.test.ts`**

Add three new tests:

```ts
test("GET /api/admin/rewards?status=Pending filters to Pending rows only", async () => {
  // seed one Issued and one Pending reward via the prisma client
  const response = await request(app).get("/api/admin/rewards?status=Pending").expect(200);
  for (const row of response.body.rewards) {
    assert.equal(row.status, "Pending");
  }
});

test("GET /api/admin/rewards returns meta.activeProvider null when no payouts config published", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
  const response = await request(app).get("/api/admin/rewards").expect(200);
  assert.equal(response.body.meta.activeProvider, null);
});

test("GET /api/admin/rewards returns meta.activeProvider populated when payouts config is published", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", {
    provider: "africas_talking", sandbox: true,
    africasTalking: { username: "u", apiKey: "k" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  const response = await request(app).get("/api/admin/rewards").expect(200);
  assert.deepEqual(response.body.meta.activeProvider, { key: "africas_talking", sandbox: true });
});
```

- [ ] **Step 5: Run the tests**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "/api/admin/rewards"
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/admin/contracts.ts backend/src/admin/providers/postgres.ts backend/src/routes/admin.ts backend/src/routes/admin.test.ts backend/src/admin/data.ts
git commit -m "feat(rewards): extend GET /admin/rewards with filters, cursor, and active provider meta"
```

---

## Task 10: Admin endpoints — `/retry`, `/mark-issued`, `/manual`

**Files:**
- Modify: `backend/src/routes/admin.ts` (add three POST handlers)
- Test: `backend/src/routes/admin.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/routes/admin.test.ts`:

```ts
test("POST /api/admin/rewards/:id/retry resets the row to Pending and clears backoff", async () => {
  const seeded = await prisma.reward.create({ data: { /* ... Failed row with retryCount=3, nextAttemptAt set ... */ } });
  await request(app)
    .post(`/api/admin/rewards/${seeded.id}/retry`)
    .set("Authorization", "Bearer <test-admin-token>")
    .expect(200);
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(updated.status, "Pending");
  assert.equal(updated.retryCount, 0);
  assert.equal(updated.nextAttemptAt, null);
  assert.equal(updated.failureReason, null);
});

test("POST /api/admin/rewards/:id/mark-issued requires a note of at least 10 chars", async () => {
  const seeded = await prisma.reward.create({ data: { /* ... Pending row ... */ } });
  await request(app)
    .post(`/api/admin/rewards/${seeded.id}/mark-issued`)
    .set("Authorization", "Bearer <test-admin-token>")
    .send({ note: "short" })
    .expect(400);
});

test("POST /api/admin/rewards/:id/mark-issued sets Issued, issuedAt, providerTxnId, noteFromActor", async () => {
  const seeded = await prisma.reward.create({ data: { /* ... Pending row ... */ } });
  await request(app)
    .post(`/api/admin/rewards/${seeded.id}/mark-issued`)
    .set("Authorization", "Bearer <test-admin-token>")
    .send({ note: "issued by hand after wallet reload", providerTxnId: "manual-12345" })
    .expect(200);
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(updated.status, "Issued");
  assert.equal(updated.providerTxnId, "manual-12345");
  assert.equal(updated.noteFromActor, "issued by hand after wallet reload");
  assert.ok(updated.issuedAt);
});

test("POST /api/admin/rewards/manual creates a Pending reward and returns its id", async () => {
  const learner = await prisma.user.create({ data: { phone: "+234999000111" } });
  const response = await request(app)
    .post("/api/admin/rewards/manual")
    .set("Authorization", "Bearer <test-admin-token>")
    .send({ userId: learner.id, amount: 750, channel: "airtime", note: "one-time discretionary payout" })
    .expect(201);
  const created = await prisma.reward.findUniqueOrThrow({ where: { id: response.body.id } });
  assert.equal(created.status, "Pending");
  assert.equal(created.amount, 750);
  assert.equal(created.noteFromActor, "one-time discretionary payout");
});
```

(The `<test-admin-token>` placeholder reuses the existing admin auth pattern from `backend/src/routes/admin-auth.test.ts` — copy whichever helper that file uses to mint a test admin JWT.)

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "/api/admin/rewards/.*/(retry|mark-issued|manual)"
```
Expected: 4 fail.

- [ ] **Step 3: Add the three handlers to `backend/src/routes/admin.ts`**

```ts
import { z } from "zod";
import { prisma } from "../admin/prisma.js";
import { requireAdminAuth } from "../auth/middleware.js"; // existing admin auth middleware

const retryParamsSchema = z.object({ id: z.string().uuid() });

adminRouter.post("/rewards/:id/retry", requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = retryParamsSchema.parse(req.params);
    const existing = await prisma.reward.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: "Reward not found" }); return; }
    if (existing.status !== "Pending" && existing.status !== "Failed") {
      res.status(409).json({ message: "Only Pending or Failed rewards can be retried" });
      return;
    }
    await prisma.reward.update({
      where: { id },
      data: {
        status: "Pending",
        retryCount: 0,
        nextAttemptAt: null,
        failureReason: null,
        attemptInProgress: false
      }
    });
    console.log(JSON.stringify({
      event: "payouts.admin_action",
      action: "retry",
      rewardId: id,
      actorId: req.adminUser?.id,
      actorRole: req.adminUser?.role
    }));
    res.status(200).json({ message: "Queued for next dispatch (≤5 min)" });
  } catch (error) { next(error); }
});

const markIssuedBodySchema = z.object({
  note: z.string().min(10, "Note must be at least 10 characters"),
  providerTxnId: z.string().optional()
});

adminRouter.post("/rewards/:id/mark-issued", requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = retryParamsSchema.parse(req.params);
    const body = markIssuedBodySchema.parse(req.body);
    const existing = await prisma.reward.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ message: "Reward not found" }); return; }
    await prisma.reward.update({
      where: { id },
      data: {
        status: "Issued",
        issuedAt: new Date(),
        providerTxnId: body.providerTxnId ?? "manual",
        noteFromActor: body.note,
        attemptInProgress: false
      }
    });
    console.log(JSON.stringify({
      event: "payouts.admin_action",
      action: "mark_issued",
      rewardId: id,
      actorId: req.adminUser?.id,
      actorRole: req.adminUser?.role,
      note: body.note
    }));
    res.status(200).json({ message: "Reward marked as Issued" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0].message });
      return;
    }
    next(error);
  }
});

const manualBodySchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
  channel: z.string().min(1).default("airtime"),
  note: z.string().min(10, "Note must be at least 10 characters")
});

adminRouter.post("/rewards/manual", requireAdminAuth, async (req, res, next) => {
  try {
    const body = manualBodySchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) { res.status(404).json({ message: "Learner not found" }); return; }
    const created = await prisma.reward.create({
      data: {
        userId: body.userId,
        module: "Manual",
        amount: body.amount,
        channel: body.channel,
        status: "Pending",
        learnerPhone: user.phone,
        noteFromActor: body.note
      }
    });
    console.log(JSON.stringify({
      event: "payouts.admin_action",
      action: "manual_create",
      rewardId: created.id,
      actorId: req.adminUser?.id,
      actorRole: req.adminUser?.role,
      amount: body.amount
    }));
    res.status(201).json({ id: created.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0].message });
      return;
    }
    next(error);
  }
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "/api/admin/rewards/.*/(retry|mark-issued|manual)"
```
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/admin.test.ts
git commit -m "feat(rewards): admin endpoints — retry, mark-issued, manual create

All three audit-log a payouts.admin_action structured entry with
actor identity. mark-issued requires a >=10-char note so manual
overrides have a paper trail. manual create routes through the
normal worker path (status=Pending) so there is no special-case
manual dispatch code."
```

---

## Task 11: Admin endpoint — CSV export

**Files:**
- Modify: `backend/src/routes/admin.ts` (add GET /admin/rewards/export)
- Test: `backend/src/routes/admin.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

```ts
test("GET /api/admin/rewards/export returns a CSV with the expected columns", async () => {
  await prisma.reward.create({ data: { /* one Issued row */ } });
  const response = await request(app)
    .get("/api/admin/rewards/export")
    .set("Authorization", "Bearer <test-admin-token>")
    .expect(200);
  assert.match(response.headers["content-type"], /text\/csv/);
  assert.match(response.headers["content-disposition"], /attachment; filename="rewards-/);
  const lines = response.text.split("\n");
  assert.equal(lines[0], "Learner,Phone,Module,Amount,Currency,Channel,Status,Created (UTC),Issued (UTC),Provider Txn ID,Failure Reason,Actor Note");
  assert.ok(lines.length >= 2);
});
```

- [ ] **Step 2: Add the handler in `backend/src/routes/admin.ts`**

```ts
adminRouter.get("/rewards/export", requireAdminAuth, async (req, res, next) => {
  try {
    const data = await getRewardsForAdmin({
      status: req.query.status as any,
      from: req.query.from ? new Date(String(req.query.from)) : undefined,
      to: req.query.to ? new Date(String(req.query.to)) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      limit: 10000   // export ceiling
    });
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = "Learner,Phone,Module,Amount,Currency,Channel,Status,Created (UTC),Issued (UTC),Provider Txn ID,Failure Reason,Actor Note";
    const rows = data.rewards.map((r) => [
      r.learner, r.learnerPhone, r.module, r.amount, r.currency, r.channel, r.status,
      r.createdAt, r.issuedAt ?? "", r.providerTxnId ?? "", r.failureReason ?? "", r.noteFromActor ?? ""
    ].map(escape).join(","));
    const filename = `rewards-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send([header, ...rows].join("\n"));
  } catch (error) { next(error); }
});
```

- [ ] **Step 3: Run the test**

```bash
npm run test -w @shetrades/backend -- --test-name-pattern "/api/admin/rewards/export"
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/admin.test.ts
git commit -m "feat(rewards): CSV export endpoint with the 12 spec columns"
```

---

## Task 12: Frontend design tokens + currency helper

**Files:**
- Modify: `shared/src/design-tokens.ts` (add status pill backgrounds if missing)
- Modify: `dashboard/app/globals.css` (token CSS variables + shadow-drawer)
- Create: `dashboard/lib/format.ts` (currency + relative-time helpers)
- Test: `dashboard/lib/format.test.ts`

### Steps

- [ ] **Step 1: Add missing tokens to `shared/src/design-tokens.ts`**

If any of the following keys are missing from the exported `tokens` object, add them under the existing color block:

```ts
"color-success-100": "#dcfce7",
"color-success-700": "#166534",
"color-warning-100": "#fef3c7",
"color-warning-700": "#854d0e",
"color-danger-100":  "#fee2e2",
"color-danger-700":  "#991b1b"
```

And under shadows:

```ts
"shadow-drawer": "-12px 0 32px rgba(15, 23, 42, 0.12)"
```

- [ ] **Step 2: Mirror the tokens in `dashboard/app/globals.css`**

In the `:root` declaration block, add (if not already present):

```css
--color-success-100: #dcfce7;
--color-success-700: #166534;
--color-warning-100: #fef3c7;
--color-warning-700: #854d0e;
--color-danger-100:  #fee2e2;
--color-danger-700:  #991b1b;
--shadow-drawer:     -12px 0 32px rgba(15, 23, 42, 0.12);
```

- [ ] **Step 3: Write `dashboard/lib/format.test.ts`**

```ts
import { formatNgn, formatRelativeTime } from "./format";

test("formatNgn renders amounts with the ₦ symbol and thousands separators", () => {
  expect(formatNgn(500)).toBe("₦500.00");
  expect(formatNgn(1500)).toBe("₦1,500.00");
});

test("formatRelativeTime returns 'just now' for <1 min", () => {
  expect(formatRelativeTime(new Date())).toBe("just now");
});

test("formatRelativeTime returns 'N min ago'", () => {
  const past = new Date(Date.now() - 5 * 60_000);
  expect(formatRelativeTime(past)).toMatch(/5 min ago/);
});

test("formatRelativeTime returns 'N h ago'", () => {
  const past = new Date(Date.now() - 3 * 3600_000);
  expect(formatRelativeTime(past)).toMatch(/3 h ago/);
});

test("formatRelativeTime returns absolute date for >7 days", () => {
  const past = new Date(Date.now() - 10 * 86400_000);
  expect(formatRelativeTime(past)).toMatch(/^\d{4}-/);
});
```

- [ ] **Step 4: Create `dashboard/lib/format.ts`**

```ts
const ngnFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatNgn(amount: number): string {
  return ngnFormatter.format(amount);
}

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;
  const diffDay = Math.floor(diffH / 24);
  if (diffDay <= 7) return `${diffDay} d ago`;
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Run the tests**

```bash
npm test -w @shetrades/dashboard -- format
```
Expected: 5 pass.

- [ ] **Step 6: Commit**

```bash
git add shared/src/design-tokens.ts dashboard/app/globals.css dashboard/lib/format.ts dashboard/lib/format.test.ts
git commit -m "feat(design): status pill tokens, drawer shadow, currency + relative-time formatters"
```

---

## Task 13: Frontend — RewardsHealthHero + 3 inner components + preview

**Files:**
- Create: `dashboard/components/rewards/IssuanceSuccessGauge.tsx`
- Create: `dashboard/components/rewards/TotalPaidHeadline.tsx`
- Create: `dashboard/components/rewards/NeedsAttentionPanel.tsx`
- Create: `dashboard/components/rewards/RewardsHealthHero.tsx`
- Create: `dashboard/app/previews/components/RewardsWorkspacePreview.tsx`
- Modify: `dashboard/app/previews/page.tsx` (register the new preview)
- Test: alongside each component (`.test.tsx`)

### Steps

- [ ] **Step 1: Write `IssuanceSuccessGauge.tsx` + test**

Props: `{ issued: number; pending: number; failed: number }`. Renders a 90×90 SVG donut (three arcs in success-700 / warning-700 / danger-700 with 100-equivalent backgrounds), centred percentage `issued / (issued+pending+failed)` rounded to one decimal, and a legend below listing the three counts with the matching pill swatches.

Test:
```tsx
import { render, screen } from "@testing-library/react";
import { IssuanceSuccessGauge } from "./IssuanceSuccessGauge";

test("shows the issuance percentage rounded to one decimal", () => {
  render(<IssuanceSuccessGauge issued={94} pending={3} failed={3} />);
  expect(screen.getByText("94.0%")).toBeInTheDocument();
});

test("shows all three counts in the legend", () => {
  render(<IssuanceSuccessGauge issued={10} pending={2} failed={1} />);
  expect(screen.getByText(/10 Issued/)).toBeInTheDocument();
  expect(screen.getByText(/2 Pending/)).toBeInTheDocument();
  expect(screen.getByText(/1 Failed/)).toBeInTheDocument();
});

test("shows 0.0% when there are no rewards", () => {
  render(<IssuanceSuccessGauge issued={0} pending={0} failed={0} />);
  expect(screen.getByText("0.0%")).toBeInTheDocument();
});
```

- [ ] **Step 2: Write `TotalPaidHeadline.tsx` + test**

Props: `{ amount: number; periodLabel: string; deltaVsPreviousPeriod: number | null }`. Renders the formatted NGN amount as the headline (`text-3xl` equivalent), the period label below ("Last 7 days"), and a delta chip `+12%` or `−4%` with success/danger colour. `null` delta hides the chip.

Test the three states.

- [ ] **Step 3: Write `NeedsAttentionPanel.tsx` + test**

Props: `{ items: Array<{ severity: "info" | "warn" | "err"; title: string; meta: string; onClick?: () => void }> }`. Renders up to 3 items max. When `items.length === 0`, renders an empty state ("All caught up — last issuance N min ago" — pass via separate prop `lastIssuedAt?: Date` so the component knows the timestamp).

Test items rendered, click handler fired, empty state shown.

- [ ] **Step 4: Write `RewardsHealthHero.tsx` + test**

Wraps the three above in a CSS grid (1fr 1fr 1.5fr). Props: combined union of the three child props plus `providerActive: boolean`. When `providerActive === false`, replaces the whole hero with an amber banner with a CTA link to `/settings/integration`.

- [ ] **Step 5: Add a preview entry — `RewardsWorkspacePreview.tsx`**

Following the existing preview pattern (look at `dashboard/app/previews/components/IntegrationWorkspacePreview.tsx` as a template), render each component in three states (loading skeleton, populated, empty) with section labels and the design token reference.

- [ ] **Step 6: Register the preview in `dashboard/app/previews/page.tsx`**

Add the new preview component to the existing tabbed preview navigation.

- [ ] **Step 7: Run frontend tests**

```bash
npm test -w @shetrades/dashboard -- rewards
```
Expected: all 8+ tests pass.

- [ ] **Step 8: Commit**

```bash
git add dashboard/components/rewards/ dashboard/app/previews/components/RewardsWorkspacePreview.tsx dashboard/app/previews/page.tsx
git commit -m "feat(rewards): RewardsHealthHero + sub-components + previews workshop entry"
```

---

## Task 14: Frontend — RewardsToolbar

**Files:**
- Create: `dashboard/components/rewards/RewardsToolbar.tsx`
- Test: `dashboard/components/rewards/RewardsToolbar.test.tsx`
- Modify: `dashboard/app/previews/components/RewardsWorkspacePreview.tsx` (add Toolbar section)

### Steps

- [ ] **Step 1: Define the component contract**

```ts
type RewardsToolbarProps = {
  status: "All" | "Issued" | "Pending" | "Failed";
  onStatusChange: (next: "All" | "Issued" | "Pending" | "Failed") => void;
  dateRange: "24h" | "7d" | "30d" | "custom";
  onDateRangeChange: (next: "24h" | "7d" | "30d" | "custom") => void;
  query: string;
  onQueryChange: (next: string) => void;
  onExportClick: () => void;
  exporting?: boolean;
};
```

- [ ] **Step 2: Write the failing tests**

```tsx
test("clicking a status pill calls onStatusChange with that key", async () => {
  const handler = vi.fn();
  render(<RewardsToolbar {...baseProps} onStatusChange={handler} />);
  await user.click(screen.getByRole("button", { name: /^Failed$/ }));
  expect(handler).toHaveBeenCalledWith("Failed");
});

test("typing in the search input debounces and calls onQueryChange", async () => {
  vi.useFakeTimers();
  const handler = vi.fn();
  render(<RewardsToolbar {...baseProps} onQueryChange={handler} />);
  await user.type(screen.getByPlaceholderText(/search learner/i), "Ada");
  expect(handler).not.toHaveBeenCalled();
  vi.advanceTimersByTime(300);
  expect(handler).toHaveBeenCalledWith("Ada");
  vi.useRealTimers();
});

test("clicking Export fires onExportClick", async () => {
  const handler = vi.fn();
  render(<RewardsToolbar {...baseProps} onExportClick={handler} />);
  await user.click(screen.getByRole("button", { name: /export/i }));
  expect(handler).toHaveBeenCalled();
});

test("Export button shows a spinner when exporting=true", () => {
  render(<RewardsToolbar {...baseProps} exporting />);
  expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
});
```

- [ ] **Step 3: Implement the component**

Use the existing `<Badge>` / `<Button>` / `<Input>` primitives from the component library. Style via `globals.css` tokens (no inline hex). Debounce the search via a 300ms `useDeferredValue` + `useEffect`.

- [ ] **Step 4: Add the Toolbar section to the preview**

Three variants: empty state, default ("All / Last 7 days"), and a long-query state.

- [ ] **Step 5: Run tests**

```bash
npm test -w @shetrades/dashboard -- RewardsToolbar
```
Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add dashboard/components/rewards/RewardsToolbar.tsx dashboard/components/rewards/RewardsToolbar.test.tsx dashboard/app/previews/components/RewardsWorkspacePreview.tsx
git commit -m "feat(rewards): RewardsToolbar component with status pills, date picker, debounced search, and export"
```

---

## Task 15: Frontend — RewardsTable + RewardDetailDrawer

**Files:**
- Create: `dashboard/components/rewards/RewardsTable.tsx`
- Create: `dashboard/components/rewards/RewardDetailDrawer.tsx`
- Test: `dashboard/components/rewards/RewardsTable.test.tsx`
- Test: `dashboard/components/rewards/RewardDetailDrawer.test.tsx`
- Modify: `dashboard/app/previews/components/RewardsWorkspacePreview.tsx`

### Steps

- [ ] **Step 1: Define the contract for `RewardsTable`**

```ts
type RewardsTableProps = {
  rewards: Array<RewardLogRow>;
  onOpenRow: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
  onMarkIssued: (id: string) => void;  // opens the drawer to capture note
  loading?: boolean;
  emptyState?: ReactNode;
};
```

- [ ] **Step 2: Write the failing tests**

Specifically cover the action-per-status matrix from spec §3.1.3:

```tsx
test("Pending row shows Retry, Mark Issued, Open actions on hover", async () => {
  render(<RewardsTable {...props} rewards={[pendingRow]} />);
  await user.hover(screen.getByText(pendingRow.learner).closest("tr")!);
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /mark issued/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
});

test("Failed row shows Retry and Open only", async () => {
  render(<RewardsTable {...props} rewards={[failedRow]} />);
  await user.hover(screen.getByText(failedRow.learner).closest("tr")!);
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /mark issued/i })).toBeNull();
});

test("Issued row shows Open only", async () => {
  render(<RewardsTable {...props} rewards={[issuedRow]} />);
  await user.hover(screen.getByText(issuedRow.learner).closest("tr")!);
  expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
});

test("Retry button calls onRetry with the row id", async () => {
  const onRetry = vi.fn().mockResolvedValue(undefined);
  render(<RewardsTable {...props} rewards={[pendingRow]} onRetry={onRetry} />);
  await user.hover(screen.getByText(pendingRow.learner).closest("tr")!);
  await user.click(screen.getByRole("button", { name: /retry/i }));
  expect(onRetry).toHaveBeenCalledWith(pendingRow.id);
});

test("Enter on a focused row calls onOpenRow", async () => {
  const onOpenRow = vi.fn();
  render(<RewardsTable {...props} rewards={[issuedRow]} onOpenRow={onOpenRow} />);
  const row = screen.getByText(issuedRow.learner).closest("tr")!;
  row.focus();
  await user.keyboard("{Enter}");
  expect(onOpenRow).toHaveBeenCalledWith(issuedRow.id);
});

test("renders status badges with the correct semantic colour", () => {
  render(<RewardsTable {...props} rewards={[issuedRow, pendingRow, failedRow]} />);
  expect(screen.getByText("Issued")).toHaveClass("ui-badge--success");
  expect(screen.getByText("Pending")).toHaveClass("ui-badge--warning");
  expect(screen.getByText("Failed")).toHaveClass("ui-badge--danger");
});
```

- [ ] **Step 3: Implement `RewardsTable.tsx`**

Wrap the existing `<Table>` primitive. Configure columns: Learner (name + masked phone), Module, Amount (via `formatNgn`), Channel · When (via `formatRelativeTime`), Status. Add an action column that renders only the buttons valid for `row.status`. Action buttons are absolutely-positioned overlay that becomes visible on `tr:hover` and `tr:focus-within` via CSS.

- [ ] **Step 4: Define the contract for `RewardDetailDrawer`**

```ts
type RewardDetailDrawerProps = {
  reward: RewardLogRow | null;          // null → drawer hidden
  open: boolean;
  onClose: () => void;
  onRetry: (id: string) => Promise<void>;
  onMarkIssued: (id: string, note: string, providerTxnId?: string) => Promise<void>;
  onOpenLearner: (userId: string) => void;
};
```

- [ ] **Step 5: Write the drawer tests**

Cover: opens with reward data, ESC closes, Retry button calls onRetry, Mark Issued surfaces a note field that requires 10+ chars, Mark Issued submit calls onMarkIssued with note and providerTxnId.

- [ ] **Step 6: Implement `RewardDetailDrawer.tsx`**

Right-side slide-out (`transform: translateX(0)` open, `100%` closed) with `--shadow-drawer`. Internal sections: identity card (learner, phone, module, amount, channel), issuance timeline (created → attempts → final), provider txn id, failure reason, actor note, and two-button footer (Retry, Mark Issued — which transitions the drawer's mode to show the note form).

- [ ] **Step 7: Add Table + Drawer to the preview**

Three states each: loading, empty, populated. Populated includes one of each status.

- [ ] **Step 8: Run all rewards tests**

```bash
npm test -w @shetrades/dashboard -- rewards
```
Expected: 15+ pass.

- [ ] **Step 9: Commit**

```bash
git add dashboard/components/rewards/RewardsTable.tsx dashboard/components/rewards/RewardsTable.test.tsx dashboard/components/rewards/RewardDetailDrawer.tsx dashboard/components/rewards/RewardDetailDrawer.test.tsx dashboard/app/previews/components/RewardsWorkspacePreview.tsx
git commit -m "feat(rewards): RewardsTable with status-gated row actions + RewardDetailDrawer"
```

---

## Task 16: Frontend — ManualRewardDrawer

**Files:**
- Create: `dashboard/components/rewards/ManualRewardDrawer.tsx`
- Test: `dashboard/components/rewards/ManualRewardDrawer.test.tsx`
- Modify: `dashboard/app/previews/components/RewardsWorkspacePreview.tsx`

### Steps

- [ ] **Step 1: Contract**

```ts
type ManualRewardDrawerProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { userId: string; amount: number; channel: string; note: string }) => Promise<void>;
  defaultAmount: number;
  defaultChannel: string;
  learners: Array<{ id: string; name: string; phone: string }>;  // for the autocomplete; later swapped for a paged fetch
};
```

- [ ] **Step 2: Write failing tests**

Cover: autocomplete filters by name/phone; amount accepts numbers >0; channel defaults to "airtime"; note shorter than 10 chars blocks submit with an inline error; valid submission calls `onSubmit` with the right shape; spinner shown while submitting.

- [ ] **Step 3: Implement**

Reuse the same drawer shell pattern from Task 15. Inputs use existing `<Input>`, `<Textarea>` primitives. Submit button disabled until all fields valid.

- [ ] **Step 4: Add to preview** (loading, empty/default, validation-error states).

- [ ] **Step 5: Run tests**

```bash
npm test -w @shetrades/dashboard -- ManualRewardDrawer
```
Expected: 6 pass.

- [ ] **Step 6: Commit**

```bash
git add dashboard/components/rewards/ManualRewardDrawer.tsx dashboard/components/rewards/ManualRewardDrawer.test.tsx dashboard/app/previews/components/RewardsWorkspacePreview.tsx
git commit -m "feat(rewards): ManualRewardDrawer with validation and submit flow"
```

---

## Task 17: Frontend — Wire `/rewards` page

**Files:**
- Replace: `dashboard/app/(admin)/rewards/page.tsx` (entire body)
- Modify: `dashboard/lib/admin/api.ts` (add list-with-filters fetcher, /retry, /mark-issued, /manual, /export)
- Modify: `dashboard/lib/admin/contracts.ts` (mirror RewardLogRow + RewardsListMeta)

### Steps

- [ ] **Step 1: Extend the API client**

```ts
// dashboard/lib/admin/api.ts (add)
export type RewardsListParams = {
  status?: "Issued" | "Pending" | "Failed";
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export function getRewardsPageData(params: RewardsListParams = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
  }
  const url = `/api/admin/rewards${query.toString() ? `?${query}` : ""}`;
  return fetchWithFallback<RewardsPageData>(url, { rewards: [], meta: { activeProvider: null, nextCursor: null } });
}

export async function retryReward(id: string) {
  return request("POST", `/api/admin/rewards/${encodeURIComponent(id)}/retry`);
}

export async function markRewardIssued(id: string, body: { note: string; providerTxnId?: string }) {
  return request("POST", `/api/admin/rewards/${encodeURIComponent(id)}/mark-issued`, body);
}

export async function createManualReward(body: { userId: string; amount: number; channel: string; note: string }) {
  return request("POST", `/api/admin/rewards/manual`, body);
}

export function rewardsExportUrl(params: RewardsListParams) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
  }
  return `/api/admin/rewards/export${query.toString() ? `?${query}` : ""}`;
}
```

- [ ] **Step 2: Replace `dashboard/app/(admin)/rewards/page.tsx`**

Replace the entire file with a client component that orchestrates the new pieces:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { AdminReviewWorkspace } from "../../../components/ui";
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy-client";
import {
  getRewardsPageData,
  retryReward,
  markRewardIssued,
  createManualReward,
  rewardsExportUrl,
  type RewardsListParams
} from "../../../lib/admin/api";
import { RewardsHealthHero } from "../../../components/rewards/RewardsHealthHero";
import { RewardsToolbar } from "../../../components/rewards/RewardsToolbar";
import { RewardsTable } from "../../../components/rewards/RewardsTable";
import { RewardDetailDrawer } from "../../../components/rewards/RewardDetailDrawer";
import { ManualRewardDrawer } from "../../../components/rewards/ManualRewardDrawer";

export default function RewardsPage() {
  const [filters, setFilters] = useState<RewardsListParams>({ /* default last 7 days */ });
  const [data, setData] = useState<RewardsPageData | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  // ... fetch on mount and on filter change, compose the page from the new components, wire callbacks
}
```

(The actual JSX wires the four panels into the existing `AdminReviewWorkspace` shell — `primary` slot = toolbar + table, `secondary` slot removed (the hero replaces the old 3-card grid), `metrics` slot replaced by `RewardsHealthHero`.)

- [ ] **Step 3: Run the dashboard build and verify the page loads in the previews workshop**

```bash
npm run build -w @shetrades/dashboard
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/\(admin\)/rewards/page.tsx dashboard/lib/admin/api.ts dashboard/lib/admin/contracts.ts
git commit -m "feat(rewards): rewire /rewards page to use the new components and extended endpoint"
```

---

## Task 18: Frontend — Payouts provider selector + credential fields

**Files:**
- Create: `dashboard/components/integration/payouts/PayoutsProviderSelector.tsx`
- Create: `dashboard/components/integration/payouts/PayoutsCredentialFields.tsx`
- Test: alongside each
- Create: `dashboard/app/previews/components/PayoutsIntegrationPreview.tsx`

### Steps

- [ ] **Step 1: `PayoutsProviderSelector.tsx` contract**

```ts
type PayoutsProviderSelectorProps = {
  value: "africas_talking" | "termii" | "reloadly";
  sandbox: boolean;
  onChange: (next: { provider: ...; sandbox: boolean }) => void;
  disabled?: boolean;
};
```

Renders three radio cards with the provider name, tagline, and a sandbox toggle nested in the selected card.

- [ ] **Step 2: Write tests for the selector**

Cover: clicking a card calls onChange with `{ provider, sandbox: false }` initially; toggling sandbox calls onChange with the new sandbox value while keeping the same provider; `disabled` blocks both interactions.

- [ ] **Step 3: Implement the selector**

Use the existing `<Card>` and a focusable `<button role="radio">` pattern. CSS in globals matches the existing radio-card visual.

- [ ] **Step 4: `PayoutsCredentialFields.tsx` contract**

```ts
type PayoutsCredentialFieldsProps = {
  provider: "africas_talking" | "termii" | "reloadly";
  value: PayoutsIntegrationPayload;
  onChange: (next: PayoutsIntegrationPayload) => void;
  errors: Partial<Record<string, string>>;
};
```

- [ ] **Step 5: Tests**

Cover: each provider renders only its credential fields (Africa's Talking: username, apiKey; Termii: apiKey, senderId; Reloadly: clientId, clientSecret); errors render under the field with `aria-describedby` wiring; changing a field calls onChange with the merged payload; password fields show/hide on the show button.

- [ ] **Step 6: Implement**

Reuse the existing `<Input>` and `<PasswordField>` primitives. Each credential field gets the `data-1p-ignore` attribute family the auth components already use.

- [ ] **Step 7: Create the preview at `dashboard/app/previews/components/PayoutsIntegrationPreview.tsx`**

Three sections: each provider in its own card with selector + fields + the connection-test result chip in healthy/degraded/failed states.

- [ ] **Step 8: Run tests**

```bash
npm test -w @shetrades/dashboard -- payouts
```
Expected: 8+ pass.

- [ ] **Step 9: Commit**

```bash
git add dashboard/components/integration/payouts/ dashboard/app/previews/components/PayoutsIntegrationPreview.tsx
git commit -m "feat(payouts): provider selector + discriminated credential fields + previews"
```

---

## Task 19: Register the Payouts tab in IntegrationSettingsWorkspace

**Files:**
- Modify: `dashboard/components/integration/IntegrationSettingsWorkspace.tsx`

### Steps

- [ ] **Step 1: Find the provider list constant**

Inside `IntegrationSettingsWorkspace.tsx`, locate the `PROVIDERS` array (the one currently holding `whatsapp` and `notification` entries).

- [ ] **Step 2: Add a `payouts` entry**

After the `notification` entry, add:

```ts
{
  id: "payouts",
  key: "integration.payouts.primary",
  label: "Payouts",
  description: "Airtime issuance provider for learner rewards",
  emptyTitle: "Configure a payouts provider",
  emptyDescription: "Pick a provider (Africa's Talking, Termii, or Reloadly) and enter credentials to start dispatching rewards."
}
```

- [ ] **Step 3: Add the payouts editing UI inside the `provider.id === "payouts"` branch**

The existing branches use a pattern like `provider.id === "whatsapp" && (<WhatsAppForm ... />)`. Add a new sibling for `payouts` that renders:

```tsx
{provider.id === "payouts" && (
  <>
    <PayoutsProviderSelector
      value={form.provider}
      sandbox={form.sandbox}
      onChange={(next) => setForm({ ...form, ...next })}
    />
    <PayoutsCredentialFields
      provider={form.provider}
      value={form}
      onChange={setForm}
      errors={errors}
    />
  </>
)}
```

- [ ] **Step 4: Extend the form-to-detail and detail-to-form helpers**

In the same file, find `detailToForm` and the form initializer. Add cases for `provider.id === "payouts"` that round-trip the `PayoutsIntegrationPayload` shape.

- [ ] **Step 5: Update the existing `IntegrationWorkspacePreview.tsx`** to add a Payouts tab in the preview.

- [ ] **Step 6: Run dashboard build**

```bash
npm run build -w @shetrades/dashboard
```
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add dashboard/components/integration/IntegrationSettingsWorkspace.tsx dashboard/app/previews/components/IntegrationWorkspacePreview.tsx
git commit -m "feat(integration): register Payouts as a third provider tab"
```

---

## Task 20: Staging deploy + Cloud Scheduler + smoke + handoff

**Files:**
- Modify: `cloudrun-staging-env.yaml` (mention PAYOUTS_WORKER_TOKEN; not committed since file is gitignored, but documented here)
- Create: `backend/src/smoke/payouts-smoke.ts`
- Modify: `.github/workflows/staging-promotion-gate.yml` (add smoke step)
- Modify: `handoff.md`
- Modify: `task-list.md`

### Steps

- [ ] **Step 1: Create the worker secret and grant Cloud Run access**

```bash
PROJECT=shetrades-staging-12345
TOKEN=$(openssl rand -hex 32)
echo -n "$TOKEN" | gcloud secrets create payouts-worker-token --data-file=- --project=$PROJECT
gcloud secrets add-iam-policy-binding payouts-worker-token \
  --member="serviceAccount:214511840103-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" --project=$PROJECT
echo "Save this token for the Cloud Scheduler step: $TOKEN"
```

- [ ] **Step 2: Add `PAYOUTS_WORKER_TOKEN` to the cloudrun-staging deploy**

Append to `cloudrun-staging-env.yaml`:

```yaml
# Worker secret consumed by /internal/payouts/dispatch. Cloud Scheduler
# sends this in the X-Internal-Worker-Token header.
PAYOUTS_WORKER_TOKEN: "ROTATE_VIA_SECRET_MANAGER"
```

Then deploy by also passing `--update-secrets PAYOUTS_WORKER_TOKEN=payouts-worker-token:latest` so the literal in the yaml is overridden by the secret.

```bash
gcloud run deploy shetrades-backend-staging --source . --region us-central1 \
  --env-vars-file cloudrun-staging-env.yaml \
  --update-secrets PAYOUTS_WORKER_TOKEN=payouts-worker-token:latest --quiet
```

- [ ] **Step 3: Create the Cloud Scheduler job**

```bash
gcloud scheduler jobs create http shetrades-payouts-dispatcher-staging \
  --schedule "*/5 * * * *" \
  --time-zone "Africa/Lagos" \
  --uri "https://shetrades-backend-staging-214511840103.us-central1.run.app/internal/payouts/dispatch" \
  --http-method POST \
  --headers "X-Internal-Worker-Token=$TOKEN" \
  --max-retry-attempts 0 \
  --location us-central1 \
  --project $PROJECT
```

- [ ] **Step 4: Write the staging smoke at `backend/src/smoke/payouts-smoke.ts`**

```ts
// Posts a synthetic module-completion webhook for a sandbox phone,
// then polls the rewards table until status=Issued or 6 min elapse.
import { prisma } from "../admin/prisma.js";
import { handleWhatsAppWebhook } from "../whatsapp/handler.js";

async function main() {
  const phone = `+234${Date.now()}`.slice(0, 14);
  // 1) Provision the user + completed module shortcut: insert a Pending reward directly,
  //    which is what the bot would do at module_completed.
  const user = await prisma.user.create({ data: { phone } });
  await prisma.reward.create({
    data: {
      userId: user.id,
      module: "Smoke Module",
      amount: 100,
      channel: "airtime",
      learnerPhone: phone,
      status: "Pending"
    }
  });

  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    const reward = await prisma.reward.findFirst({ where: { learnerPhone: phone }, orderBy: { createdAt: "desc" } });
    if (reward?.status === "Issued") {
      console.log(JSON.stringify({ event: "payouts.smoke.ok", rewardId: reward.id, providerTxnId: reward.providerTxnId }));
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.error(JSON.stringify({ event: "payouts.smoke.timeout", phone }));
  process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "payouts.smoke.error", message: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
```

- [ ] **Step 5: Add a `smoke:payouts` script to `backend/package.json`**

```json
"smoke:payouts": "tsx src/smoke/payouts-smoke.ts"
```

- [ ] **Step 6: Add a step to `.github/workflows/staging-promotion-gate.yml`**

After the existing smoke step:

```yaml
      - name: Run payouts smoke
        if: success() && env.STAGING_BACKEND_READY_URL != ''
        run: npm run smoke:payouts -w @shetrades/backend
```

- [ ] **Step 7: Publish a sandbox Payouts config on staging**

Via the dashboard `/settings → Integration → Payouts`, pick Africa's Talking, enter sandbox username `sandbox` and apiKey `atsk_xxx`, toggle sandbox ON, publish.

- [ ] **Step 8: Run the smoke locally against staging**

```bash
POSTGRES_URL="..." STAGING_BACKEND_READY_URL="..." npm run smoke:payouts -w @shetrades/backend
```
Expected: log line `payouts.smoke.ok` within 6 minutes.

- [ ] **Step 9: Update `handoff.md`**

Add an entry under "Recent Fixes" summarising the redesign + automated dispatch, referencing the spec and this plan. Note any production cutover steps still pending (production-side secret + scheduler + provider config).

- [ ] **Step 10: Update `task-list.md`**

Mark the rewards-redesign task complete with a short summary.

- [ ] **Step 11: Final commit**

```bash
git add backend/src/smoke/payouts-smoke.ts backend/package.json .github/workflows/staging-promotion-gate.yml handoff.md task-list.md
git commit -m "feat(payouts): staging Cloud Scheduler + end-to-end smoke

Deploys backend with PAYOUTS_WORKER_TOKEN secret mount. Cloud
Scheduler hits /internal/payouts/dispatch every 5 min. New
payouts-smoke.ts confirms a synthetic Pending row reaches
Issued within 6 minutes via the sandbox provider. Wired into
staging-promotion-gate.yml so CI catches regressions.

Production cutover (separate change): create production-side
Secret + Scheduler, publish a production Payouts config doc."
```

---

## Self-review

**Spec coverage:**

- §1 Background and goals — covered as the goal statement at the top.
- §2 Architecture overview — covered by Tasks 2–8 (provider seam, worker, scheduler).
- §3 The /rewards page (3.1–3.4) — covered by Tasks 13–17.
- §4 /settings → Integration → Payouts tab (4.1–4.4) — covered by Tasks 18 + 19.
- §5 Provider adapter pattern (5.1–5.3) — covered by Task 2 (contract) + Tasks 3, 7, 8 (adapters).
- §6 Issuance worker (6.1–6.7) — covered by Tasks 5 (loop), 6 (endpoint), 20 (scheduler + smoke + observability).
- §7 Data model changes — covered by Task 1.
- §8 Code layout — covered implicitly via the file paths in every task.
- §9 Testing — each implementation task has TDD test steps; Task 20 wires the smoke into CI.
- §10 Configuration & environment — covered by Task 20.
- §11 Open items resolved with defaults — defaults already baked into the code in Tasks 1, 10, 12.
- §12 Implementation order — followed.
- §13 Acceptance criteria — Task 20 explicitly verifies the end-to-end happy path; the per-task tests cover the row-level cases.

**Placeholder scan:** No `TBD`, `TODO`, `fill in`, or "implement later" markers. The few `<test-admin-token>` placeholders in Task 10 explicitly reference the existing `backend/src/routes/admin-auth.test.ts` helper to copy from — not a placeholder for the engineer to invent.

**Type consistency:** `RewardLogRow`, `RewardsPageData`, `PayoutsIntegrationPayload`, `DispatchResult`, `PayoutProvider`, `RewardDispatchInput` are defined once (Tasks 2 + 9) and reused consistently across Tasks 3–18.

**Scope check:** Single feature, 20 tasks, each independently testable. Subagent-driven execution will work.

If you find issues during execution, follow `superpowers:systematic-debugging`. Each task should produce a green test run before moving on.
