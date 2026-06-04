# /users Functionality + Reward Rules Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/users` admin page functional (learner-detail drawer, flag-for-follow-up, CSV export) and add an admin-managed Reward Rules tab on `/settings` that drives the module-completion reward amount/channel without a redeploy.

**Architecture:** Backend adds three `/api/admin/users/*` endpoints (matching the existing plain-handler admin pattern) plus two new `User` columns wired through the drift-tolerant `ensurePrismaTables` bootstrap. The Reward Rule is a config-platform document in the `integration` namespace consumed by the WhatsApp handler with the env var as fallback. Frontend converts `/users` to a client component with a detail drawer, and adds a `RewardRulesWorkspace` settings tab modelled on the existing payouts workspace.

**Tech Stack:** TypeScript / Node 24 / Express 5 / Prisma 7 + pg adapter / Zod 4 / Next.js 16 / React 19 / Supertest / `node --test` via tsx.

---

## Spec Reference

Implements [`docs/superpowers/specs/2026-06-04-users-functionality-and-reward-rules-design.md`](../specs/2026-06-04-users-functionality-and-reward-rules-design.md). Re-read it before starting — it has the `LearnerDetail` shape (§2.1.1), the reward-rule consumption rules (§3.1.3), and acceptance criteria (§7).

## Task Order Summary

| # | Task | Feature |
|---|---|---|
| 1 | User schema fields + ensurePrismaTables ALTERs + admin_users_view column | A |
| 2 | UserRow contract + fetchUsersFromPostgres + fixtures | A |
| 3 | Learner-detail aggregation module + test | A |
| 4 | GET /api/admin/users/:phone route + test | A |
| 5 | POST /api/admin/users/:phone/flag route + test | A |
| 6 | GET /api/admin/users/export route + test | A |
| 7 | Frontend client API + LearnerDetail contract | A |
| 8 | LearnerDetailDrawer component + preview | A |
| 9 | /users → client component, wired actions | A |
| 10 | rewardRulesPayloadSchema + union + getRuntimeRewardRules + test | B |
| 11 | Handler module_completed reads the rule + test | B |
| 12 | RewardRulesWorkspace component + preview | B |
| 13 | Register Rewards tab in settings page | B |
| 14 | Full verification + handoff log | — |

---

## Task 1: User schema fields + bootstrap + view column

**Files:**
- Modify: `backend/prisma/schema.prisma` (User model)
- Modify: `backend/src/admin/prisma.ts` (ensurePrismaTables users block + admin_users_view)

- [ ] **Step 1: Add the two fields to the `User` model in `backend/prisma/schema.prisma`**

In `model User { ... }`, after the existing `status` line, add:

```prisma
  flaggedForFollowUp Boolean  @default(false)
  followUpNote       String?
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client (v7.8.0)`.

- [ ] **Step 3: Add ALTERs in `backend/src/admin/prisma.ts`**

In `ensurePrismaTables`, inside the `// users` block (after the existing `ALTER TABLE users ADD COLUMN IF NOT EXISTS status ...` line), add:

```ts
await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "flaggedForFollowUp" BOOLEAN NOT NULL DEFAULT false;`);
await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "followUpNote" TEXT;`);
```

- [ ] **Step 4: Extend `admin_users_view` in `initializeAdminViews`**

In `backend/src/admin/prisma.ts`, the `admin_users_view` CREATE OR REPLACE currently selects `id, name, phone, location, language, status, completion`. Add the flag column:

```ts
await prisma.$executeRawUnsafe(`
  CREATE OR REPLACE VIEW admin_users_view AS
  SELECT
    id,
    name,
    phone,
    location,
    language,
    status,
    COALESCE("flaggedForFollowUp", false) AS "flaggedForFollowUp",
    (SELECT COALESCE(MAX("completionPercentage"), 0) FROM user_progress WHERE "userId" = users.id)::text || '%' as completion
  FROM users;
`);
```

- [ ] **Step 5: Add the new columns to the legacy-NOT-NULL allow-list**

In the `Neutralise legacy NOT NULL constraints` DO block, update the `users` allow-list line to include the new required column:

```ts
(table_name = 'users' AND column_name IN ('id','phone','status','flaggedForFollowUp','createdAt','updatedAt'))
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck -w @shetrades/backend`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/admin/prisma.ts
git commit -m "feat(users): add flaggedForFollowUp + followUpNote to User schema and view"
```

---

## Task 2: UserRow contract + provider + fixtures

**Files:**
- Modify: `backend/src/admin/contracts.ts` (UserRow)
- Modify: `backend/src/admin/providers/postgres.ts` (fetchUsersFromPostgres)
- Modify: `backend/src/admin/fixtures.ts` (fallbackUsersData)
- Modify: `backend/src/admin/providers/firestore.ts` (fetchUsersFromFirestore — keep shape valid)

- [ ] **Step 1: Extend `UserRow` in `backend/src/admin/contracts.ts`**

```ts
export type UserRow = {
  name: string;
  phone: string;
  location: string;
  language: string;
  completion: string;
  status: "Active" | "At Risk";
  flaggedForFollowUp: boolean;
};
```

- [ ] **Step 2: Map the column in `fetchUsersFromPostgres` (`backend/src/admin/providers/postgres.ts`)**

Change the typed row and SELECT to include the flag:

```ts
const rows = await queryWithPolicy<{
  name: string;
  phone: string;
  location: string;
  language: string;
  completion: string;
  status: "Active" | "At Risk";
  flaggedForFollowUp: boolean;
}>(
  `SELECT name, phone, location, language, completion, status, "flaggedForFollowUp" FROM ${mappings.usersView} LIMIT 200`
);
return { users: rows.map((r) => ({ ...r, flaggedForFollowUp: Boolean(r.flaggedForFollowUp) })) };
```

(Adjust the existing `return { users: rows }` line to the mapped version above.)

- [ ] **Step 3: Update `fallbackUsersData` in `backend/src/admin/fixtures.ts`**

Add `flaggedForFollowUp: false` to each user fixture row.

- [ ] **Step 4: Update `fetchUsersFromFirestore` in `backend/src/admin/providers/firestore.ts`**

Wherever it constructs `UserRow` objects, add `flaggedForFollowUp: false` (Firestore path does not track this field yet). If it maps from documents, default it: `flaggedForFollowUp: Boolean(doc.flaggedForFollowUp ?? false)`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @shetrades/backend`
Expected: 0 errors (this will fail loudly if any UserRow construction site was missed — fix each).

- [ ] **Step 6: Commit**

```bash
git add backend/src/admin/contracts.ts backend/src/admin/providers/postgres.ts backend/src/admin/fixtures.ts backend/src/admin/providers/firestore.ts
git commit -m "feat(users): surface flaggedForFollowUp in the directory row"
```

---

## Task 3: Learner-detail aggregation module

**Files:**
- Create: `backend/src/admin/users-detail.ts`
- Create: `backend/src/admin/users-detail.test.ts`

- [ ] **Step 1: Write the failing test `backend/src/admin/users-detail.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./prisma.js";
import { getLearnerDetail } from "./users-detail.js";

test("getLearnerDetail returns null for an unknown phone", async () => {
  const result = await getLearnerDetail("+234000000nope");
  assert.equal(result, null);
});

test("getLearnerDetail aggregates identity, session, progress, quiz, rewards", async () => {
  const phone = `+234${Date.now()}`.slice(0, 14);
  const user = await prisma.user.create({
    data: {
      phone,
      name: "Detail Test",
      location: "Anambra",
      language: "en",
      status: "Active",
      session: { create: { state: "module_menu", completedLessons: ["content.lesson.m1_l1"], currentLessonKey: "content.lesson.m1_l2" } },
      progress: { create: { module: "Module 1", completionPercentage: 50 } },
      quizAttempts: { create: { lessonKey: "content.lesson.m1_l1", passed: true, attemptCount: 2 } },
      rewards: { create: { module: "Module 1", amount: 500, channel: "airtime", status: "Pending", learnerPhone: phone } }
    }
  });

  const detail = await getLearnerDetail(phone);
  assert.ok(detail);
  assert.equal(detail!.identity.phone, phone);
  assert.equal(detail!.identity.name, "Detail Test");
  assert.equal(detail!.identity.flaggedForFollowUp, false);
  assert.equal(detail!.session?.state, "module_menu");
  assert.deepEqual(detail!.session?.completedLessons, ["content.lesson.m1_l1"]);
  assert.equal(detail!.progress[0].module, "Module 1");
  assert.equal(detail!.progress[0].completionPercentage, 50);
  assert.equal(detail!.quizAttempts[0].passed, true);
  assert.equal(detail!.rewards[0].amount, 500);
  assert.equal(typeof detail!.identity.createdAt, "string");

  await prisma.user.delete({ where: { id: user.id } });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx tsx --test backend/src/admin/users-detail.test.ts`
Expected: FAIL (`Cannot find module './users-detail.js'`). (If the env has no Postgres, the test errors on the DB call instead — that is expected; the test runs green in CI where Postgres is present. Proceed to implement.)

- [ ] **Step 3: Create `backend/src/admin/users-detail.ts`**

```ts
import { prisma } from "./prisma.js";

export type LearnerDetail = {
  identity: {
    id: string;
    name: string | null;
    phone: string;
    location: string | null;
    language: string | null;
    status: string;
    flaggedForFollowUp: boolean;
    followUpNote: string | null;
    createdAt: string;
  };
  session: {
    state: string | null;
    currentLessonKey: string | null;
    completedLessons: string[];
    lastUpdatedAt: string | null;
  } | null;
  progress: Array<{ module: string; completionPercentage: number; updatedAt: string }>;
  quizAttempts: Array<{ lessonKey: string; passed: boolean; attemptCount: number; lastAttemptAt: string }>;
  rewards: Array<{ id: string; module: string; amount: number; channel: string; status: string; issuedAt: string | null; createdAt: string }>;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function getLearnerDetail(phone: string): Promise<LearnerDetail | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { session: true, progress: true, quizAttempts: true, rewards: true }
  });
  if (!user) return null;

  return {
    identity: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      location: user.location,
      language: user.language,
      status: user.status,
      flaggedForFollowUp: user.flaggedForFollowUp,
      followUpNote: user.followUpNote,
      createdAt: user.createdAt.toISOString()
    },
    session: user.session
      ? {
          state: user.session.state,
          currentLessonKey: user.session.currentLessonKey,
          completedLessons: user.session.completedLessons,
          lastUpdatedAt: iso(user.session.lastUpdatedAt)
        }
      : null,
    progress: user.progress.map((p) => ({
      module: p.module,
      completionPercentage: p.completionPercentage,
      updatedAt: p.updatedAt.toISOString()
    })),
    quizAttempts: user.quizAttempts.map((q) => ({
      lessonKey: q.lessonKey,
      passed: q.passed,
      attemptCount: q.attemptCount,
      lastAttemptAt: q.lastAttemptAt.toISOString()
    })),
    rewards: user.rewards.map((r) => ({
      id: r.id,
      module: r.module,
      amount: r.amount,
      channel: r.channel,
      status: r.status,
      issuedAt: iso(r.issuedAt),
      createdAt: r.createdAt.toISOString()
    }))
  };
}
```

- [ ] **Step 4: Run the test (in an env with Postgres) or typecheck**

Run: `npm run typecheck -w @shetrades/backend`
Expected: 0 errors. (Full test runs green in CI.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/users-detail.ts backend/src/admin/users-detail.test.ts
git commit -m "feat(users): learner-detail aggregation query"
```

---

## Task 4: GET /api/admin/users/:phone

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Modify: `backend/src/routes/admin.test.ts`

- [ ] **Step 1: Write the failing test (add to `backend/src/routes/admin.test.ts`)**

```ts
test("GET /api/admin/users/:phone returns 404 for unknown learner", async () => {
  await request(app).get("/api/admin/users/%2B234000000nope").expect(404);
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx tsx --test backend/src/routes/admin.test.ts`
Expected: FAIL (route returns 200/500, not 404). (DB-dependent tests may error without Postgres; this 404 path does not require a row to exist.)

- [ ] **Step 3: Add the handler to `backend/src/routes/admin.ts`**

Add the import at the top (with the other imports):

```ts
import { getLearnerDetail } from "../admin/users-detail.js";
```

Add the route (place it BEFORE any `/users/export` or other `/users/...` routes so the `:phone` param does not shadow more specific paths — i.e. define `/users/export` in Task 6 ABOVE this one, OR give this one a guard. To keep ordering simple, register `/users/export` and `/users/:phone/flag` before `/users/:phone`. For this task, add `/users/:phone` now; later tasks insert their routes above it.):

```ts
adminRouter.get("/users/:phone", async (req, res, next) => {
  try {
    const phone = String(req.params.phone);
    const detail = await getLearnerDetail(phone);
    if (!detail) {
      res.status(404).json({ message: "Learner not found." });
      return;
    }
    res.status(200).json(detail);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `npx tsx --test backend/src/routes/admin.test.ts`
Expected: the new 404 test passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/admin.test.ts
git commit -m "feat(users): GET /api/admin/users/:phone learner detail endpoint"
```

---

## Task 5: POST /api/admin/users/:phone/flag

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Modify: `backend/src/routes/admin.test.ts`

- [ ] **Step 1: Write the failing tests (add to `backend/src/routes/admin.test.ts`)**

```ts
test("POST /api/admin/users/:phone/flag flags a learner and returns identity", async () => {
  const phone = `+234${Date.now()}`.slice(0, 14);
  await prisma.user.create({ data: { phone, name: "Flag Test", status: "Active" } });
  const res = await request(app)
    .post(`/api/admin/users/${encodeURIComponent(phone)}/flag`)
    .send({ flagged: true, note: "needs a follow-up call" })
    .expect(200);
  assert.equal(res.body.flaggedForFollowUp, true);
  assert.equal(res.body.followUpNote, "needs a follow-up call");
  const reread = await prisma.user.findUniqueOrThrow({ where: { phone } });
  assert.equal(reread.flaggedForFollowUp, true);
});

test("POST /api/admin/users/:phone/flag rejects a note longer than 500 chars", async () => {
  const phone = `+234${Date.now() + 1}`.slice(0, 14);
  await prisma.user.create({ data: { phone, status: "Active" } });
  await request(app)
    .post(`/api/admin/users/${encodeURIComponent(phone)}/flag`)
    .send({ flagged: true, note: "x".repeat(501) })
    .expect(400);
});

test("POST /api/admin/users/:phone/flag returns 404 for unknown learner", async () => {
  await request(app)
    .post("/api/admin/users/%2B234000nope/flag")
    .send({ flagged: true })
    .expect(404);
});
```

- [ ] **Step 2: Run them, confirm they fail**

Run: `npx tsx --test backend/src/routes/admin.test.ts`
Expected: the three new tests fail (route not found / 500).

- [ ] **Step 3: Add the handler to `backend/src/routes/admin.ts`**

Ensure `import { z } from "zod";` and `import { prisma } from "../admin/prisma.js";` exist (add if missing). Add the route ABOVE `/users/:phone`:

```ts
const flagBodySchema = z.object({
  flagged: z.boolean(),
  note: z.string().max(500).optional()
});

adminRouter.post("/users/:phone/flag", async (req, res, next) => {
  try {
    const phone = String(req.params.phone);
    const body = flagBodySchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (!existing) {
      res.status(404).json({ message: "Learner not found." });
      return;
    }
    const updated = await prisma.user.update({
      where: { phone },
      data: {
        flaggedForFollowUp: body.flagged,
        followUpNote: body.flagged ? body.note ?? null : null
      }
    });
    console.log(JSON.stringify({
      event: "users.admin_action",
      action: body.flagged ? "flag" : "unflag",
      phone,
      note: body.flagged ? body.note ?? null : null
    }));
    res.status(200).json({
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      location: updated.location,
      language: updated.language,
      status: updated.status,
      flaggedForFollowUp: updated.flaggedForFollowUp,
      followUpNote: updated.followUpNote,
      createdAt: updated.createdAt.toISOString()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues[0].message });
      return;
    }
    next(error);
  }
});
```

- [ ] **Step 4: Run the tests, confirm pass**

Run: `npx tsx --test backend/src/routes/admin.test.ts`
Expected: the three new tests pass (in a Postgres-backed env).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/admin.test.ts
git commit -m "feat(users): POST /api/admin/users/:phone/flag toggle with note"
```

---

## Task 6: GET /api/admin/users/export

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Modify: `backend/src/routes/admin.test.ts`

- [ ] **Step 1: Write the failing test (add to `backend/src/routes/admin.test.ts`)**

```ts
test("GET /api/admin/users/export returns CSV with the expected header", async () => {
  const res = await request(app).get("/api/admin/users/export").expect(200);
  assert.match(res.headers["content-type"], /text\/csv/);
  assert.match(res.headers["content-disposition"], /attachment; filename="users-/);
  const firstLine = res.text.split("\n")[0];
  assert.equal(firstLine, "Name,Phone,Location,Language,Completion,Status,Flagged,Follow-up Note");
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx tsx --test backend/src/routes/admin.test.ts`
Expected: FAIL (route resolves to `/users/:phone` with phone="export", returns 404).

- [ ] **Step 3: Add the handler to `backend/src/routes/admin.ts` ABOVE `/users/:phone`**

Add the import for the users data accessor (used elsewhere in the file already via `getUsersData`):

```ts
import { getUsersData } from "../admin/data.js";
```

Add the route:

```ts
adminRouter.get("/users/export", async (_req, res, next) => {
  try {
    const data = await getUsersData();
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = "Name,Phone,Location,Language,Completion,Status,Flagged,Follow-up Note";
    const rows = data.users.map((u) =>
      [u.name, u.phone, u.location, u.language, u.completion, u.status, u.flaggedForFollowUp ? "Yes" : "No", ""]
        .map(escape)
        .join(",")
    );
    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send([header, ...rows].join("\n"));
  } catch (error) {
    next(error);
  }
});
```

NOTE: the directory `UserRow` does not carry `followUpNote` (only the detail endpoint does), so the export's "Follow-up Note" column is intentionally blank for now; the column exists for forward-compatibility. This keeps the export reading the cheap directory view rather than N detail queries.

- [ ] **Step 4: Verify route ordering**

Confirm in `backend/src/routes/admin.ts` the order is: `/users/export` → `/users/:phone/flag` → `/users/:phone` (specific before param). Re-order if needed.

- [ ] **Step 5: Run the test, confirm pass**

Run: `npx tsx --test backend/src/routes/admin.test.ts`
Expected: the export test passes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/admin.test.ts
git commit -m "feat(users): GET /api/admin/users/export CSV"
```

---

## Task 7: Frontend client API + LearnerDetail contract

**Files:**
- Modify: `dashboard/lib/admin/contracts.ts`
- Modify: `dashboard/lib/admin/api.ts`

- [ ] **Step 1: Mirror types in `dashboard/lib/admin/contracts.ts`**

Add `flaggedForFollowUp: boolean;` to the frontend `UserRow` type. Add the `LearnerDetail` type (copy the shape from `backend/src/admin/users-detail.ts` exactly — identity/session/progress/quizAttempts/rewards).

- [ ] **Step 2: Add client API functions in `dashboard/lib/admin/api.ts`**

```ts
export function getLearnerDetail(phone: string) {
  return fetchWithFallback<LearnerDetail | null>(
    `/api/admin/users/${encodeURIComponent(phone)}`,
    null
  );
}

export async function flagLearner(phone: string, body: { flagged: boolean; note?: string }) {
  return request("POST", `/api/admin/users/${encodeURIComponent(phone)}/flag`, body);
}

export function usersExportUrl() {
  return `/api/admin/users/export`;
}
```

(Use the same `fetchWithFallback` / `request` helpers the file already exports — match their existing signatures; if `request` takes different args, adapt to match the rewards endpoints added earlier.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @shetrades/dashboard`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/lib/admin/contracts.ts dashboard/lib/admin/api.ts
git commit -m "feat(users): client API for learner detail, flag, and export"
```

---

## Task 8: LearnerDetailDrawer component + preview

**Files:**
- Create: `dashboard/components/users/LearnerDetailDrawer.tsx`
- Create: `dashboard/components/users/LearnerDetailDrawer.test.tsx`
- Create: `dashboard/app/previews/components/UsersWorkspacePreview.tsx`
- Modify: `dashboard/app/previews/page.tsx`

- [ ] **Step 1: Define the component contract and implement `LearnerDetailDrawer.tsx`**

```ts
type LearnerDetailDrawerProps = {
  phone: string | null;        // null → closed
  open: boolean;
  onClose: () => void;
  onFlagChange: (phone: string, flagged: boolean, note?: string) => Promise<void>;
};
```

Implement a right-side drawer reusing the same shell + `--shadow-drawer` token as `dashboard/components/rewards/RewardDetailDrawer.tsx` (open: `transform: translateX(0)`, closed: `translateX(100%)`). On `open && phone`, call `getLearnerDetail(phone)` in a `useEffect`, hold `{ loading, detail, error }`. Render sections: Identity (name, phone, location, language, status badge, member-since via `formatRelativeTime`), Follow-up (a flag toggle + note `<textarea>`; toggling calls `onFlagChange`), Session (state, current lesson, completed-lesson count, last active), Progress (list of module + %), Quiz attempts (list of lessonKey + passed badge + attemptCount), Rewards (list of module + `formatNgn(amount)` + status badge). Use existing `Badge`/`Button` primitives. Use the `formatNgn` + `formatRelativeTime` helpers from `dashboard/lib/format.ts`. ESC closes (keydown listener while open).

- [ ] **Step 2: Write tests `LearnerDetailDrawer.test.tsx`**

Cover: when `open` and a mocked `getLearnerDetail` resolves, identity name renders; clicking the flag toggle calls `onFlagChange(phone, true, ...)`; pressing Escape calls `onClose`; loading state shows before the fetch resolves. (These rely on a dashboard test runner; if none is configured the tests are authored for when one is — see the carried-over follow-up in the rewards spec. Author them regardless.)

- [ ] **Step 3: Create `UsersWorkspacePreview.tsx`**

Following the existing preview pattern (see `dashboard/app/previews/components/RewardsWorkspacePreview.tsx`), render `LearnerDetailDrawer` in loading / populated / empty / error states with section labels.

- [ ] **Step 4: Register the preview in `dashboard/app/previews/page.tsx`**

Add `UsersWorkspacePreview` to the preview navigation, matching how other previews are registered.

- [ ] **Step 5: Build**

Run: `npm run build -w @shetrades/dashboard`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add dashboard/components/users/ dashboard/app/previews/components/UsersWorkspacePreview.tsx dashboard/app/previews/page.tsx
git commit -m "feat(users): LearnerDetailDrawer component + previews workshop entry"
```

---

## Task 9: /users → client component, wired actions

**Files:**
- Modify: `dashboard/app/(admin)/users/page.tsx`

- [ ] **Step 1: Convert the page to a client component**

Rewrite `dashboard/app/(admin)/users/page.tsx` with `"use client"`. Keep the existing `AdminReviewWorkspace` shell, metrics, and the two support cards. Replace the server `await getUsersPageData()` with a client fetch in `useEffect` holding `{ result, loading }`. Keep all the existing derived metrics (activeCount, atRiskCount, completionAverage, topLocations, topLanguages) computed from `result.data.users`.

State to add:
```ts
const [openPhone, setOpenPhone] = useState<string | null>(null);
```

Refetch helper that re-pulls `getUsersPageData()` after a flag change.

- [ ] **Step 2: Wire the row action column**

Replace the `AdminActionRail` actions array so:
- Preview action: `disabled: false`, `onClick: () => setOpenPhone(row.phone)`.
- Flag action: `disabled: false`, `onClick: () => handleFlag(row.phone, !row.flaggedForFollowUp)` where `handleFlag` calls `flagLearner` then refetches; show the flag tone when `row.flaggedForFollowUp`.
- Contact action: keep `disabled: true`, set its label/aria to include "(coming soon)".

(`AdminActionRail` action items support `onClick` and `disabled`; if the current type lacks `onClick`, extend the `AdminActionRail` action type to accept an optional `onClick?: () => void` and wire it to the button — this is a small, in-scope improvement to the shared component.)

Add a flag `Badge` (variant `warning`, label "Flagged") next to the status badge when `row.flaggedForFollowUp` is true.

- [ ] **Step 3: Wire the header Export button**

Change the header `<Button>` to `onClick={() => { window.location.href = usersExportUrl(); }}`.

- [ ] **Step 4: Wire the "Create Import Batch" button to disabled "Soon"**

In the "User Actions" support card EmptyState, set the action `<Button variant="secondary" disabled>` and append " (coming soon)" to its label.

- [ ] **Step 5: Mount the drawer**

```tsx
<LearnerDetailDrawer
  phone={openPhone}
  open={openPhone !== null}
  onClose={() => setOpenPhone(null)}
  onFlagChange={async (phone, flagged, note) => { await flagLearner(phone, { flagged, ...(note ? { note } : {}) }); await refetch(); }}
/>
```

- [ ] **Step 6: Build**

Run: `npm run build -w @shetrades/dashboard`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add dashboard/app/\(admin\)/users/page.tsx dashboard/components/ui/AdminActionRail.tsx
git commit -m "feat(users): wire Preview, Flag, and Export; disable Contact/Import with Soon"
```

---

## Task 10: rewardRulesPayloadSchema + union + runtime helper

**Files:**
- Modify: `backend/src/config-platform/contracts.ts`
- Modify: `backend/src/config-platform/runtime-config.ts`
- Create: `backend/src/config-platform/reward-rules.test.ts`

- [ ] **Step 1: Add the schema in `backend/src/config-platform/contracts.ts`**

Above the `configPayloadSchema` union definition:

```ts
export const rewardRulesPayloadSchema = z.object({
  kind: z.literal("reward_rules"),
  amount: z.number().positive(),
  channel: z.literal("airtime"),
  enabled: z.boolean()
});
export type RewardRulesPayload = z.infer<typeof rewardRulesPayloadSchema>;
```

Add it to the `configPayloadSchema` union BEFORE the `z.record` catch-all:

```ts
export const configPayloadSchema = z.union([
  legalBlockPayloadSchema,
  optionSetPayloadSchema,
  lessonContentPayloadSchema,
  integrationConfigPayloadSchema,
  rewardRulesPayloadSchema,
  z.record(z.string(), z.unknown())
]);
```

- [ ] **Step 2: Add the runtime helper in `backend/src/config-platform/runtime-config.ts`**

```ts
import type { RewardRulesPayload } from "./contracts.js";

export function getRuntimeRewardRules() {
  return getRuntimeIntegrationConfig<RewardRulesPayload>("reward.rules.primary");
}
```

(If `RewardRulesPayload` import would create a cycle, define the import as `import type` — type-only imports are erased and never cause cycles.)

- [ ] **Step 3: Write the schema test `backend/src/config-platform/reward-rules.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { rewardRulesPayloadSchema, configPayloadSchema } from "./contracts.js";

test("rewardRulesPayloadSchema accepts a valid rule", () => {
  const r = rewardRulesPayloadSchema.parse({ kind: "reward_rules", amount: 750, channel: "airtime", enabled: true });
  assert.equal(r.amount, 750);
});

test("configPayloadSchema routes a reward-rule payload to the reward-rules member", () => {
  const parsed = configPayloadSchema.parse({ kind: "reward_rules", amount: 500, channel: "airtime", enabled: false });
  assert.equal((parsed as { kind?: string }).kind, "reward_rules");
});

test("rewardRulesPayloadSchema rejects a non-positive amount", () => {
  const r = rewardRulesPayloadSchema.safeParse({ kind: "reward_rules", amount: 0, channel: "airtime", enabled: true });
  assert.equal(r.success, false);
});
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `npx tsx --test backend/src/config-platform/reward-rules.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config-platform/contracts.ts backend/src/config-platform/runtime-config.ts backend/src/config-platform/reward-rules.test.ts
git commit -m "feat(rewards): reward rules config schema + runtime helper"
```

---

## Task 11: Handler reads the reward rule

**Files:**
- Modify: `backend/src/whatsapp/handler.ts`

- [ ] **Step 1: Import the helper at the top of `backend/src/whatsapp/handler.ts`**

Add to the existing runtime-config import line:

```ts
import { getRuntimeRewardRules } from "../config-platform/runtime-config.js";
```

(Add it to the existing `import { ... } from "../config-platform/runtime-config.js";` line rather than a new line.)

- [ ] **Step 2: Update the `module_completed` branch**

Replace the current body of `} else if (event.type === "module_completed") {` (the env-var amount/channel + upsert block) with:

```ts
} else if (event.type === "module_completed") {
  const rule = getRuntimeRewardRules();
  if (rule && rule.enabled === false) {
    // Rewards disabled by the admin reward rule — skip creating a reward.
    return;
  }
  const envAmount = Number(process.env.REWARD_DEFAULT_AMOUNT);
  const fallbackAmount = Number.isFinite(envAmount) && envAmount > 0 ? envAmount : 500;
  const amount = rule?.amount ?? fallbackAmount;
  const channel = rule?.channel ?? ((process.env.REWARD_DEFAULT_CHANNEL ?? "airtime").trim() || "airtime");
  const moduleKey = (event.module ?? "").trim() || "Unknown";
  await prisma.reward.upsert({
    where: { userId_module: { userId: session.userId, module: moduleKey } },
    update: {},
    create: {
      userId: session.userId,
      module: moduleKey,
      amount,
      channel,
      status: "Pending",
      learnerPhone: session.phone
    }
  });
}
```

NOTE: the `return` inside the `for...of` loop in `recordAnalytics` only skips the remaining work for THIS event; confirm the surrounding structure is a loop over events and `return` is acceptable (it exits recordAnalytics entirely). If `recordAnalytics` processes multiple events in a loop, change `return;` to `continue;` so other events still record. Inspect the function before choosing — the analytics events are pushed per-turn and a module_completed is the last in its turn, but `continue` is the safe choice. Use `continue;`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @shetrades/backend`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/whatsapp/handler.ts
git commit -m "feat(rewards): handler honors the admin reward rule with env fallback"
```

---

## Task 12: RewardRulesWorkspace component + preview

**Files:**
- Create: `dashboard/components/integration/RewardRulesWorkspace.tsx`
- Modify: `dashboard/app/previews/components/IntegrationWorkspacePreview.tsx`

- [ ] **Step 1: Implement `RewardRulesWorkspace.tsx`**

Model it on `dashboard/components/integration/IntegrationPayoutsWorkspace.tsx`: same `request` helper (config-admin base), same draft/publish/rollback + history controls, same `detailToForm` / `serializeForm` / `validateForm` shape but for the reward-rule payload. Form state:

```ts
type RewardRulesFormState = {
  title: string;          // document title, default "Primary Reward Rule"
  amount: string;         // text input, parsed to number on serialize
  channel: "airtime";
  enabled: boolean;
};
```

`serializeForm` produces `{ kind: "reward_rules", amount: Number(form.amount), channel: form.channel, enabled: form.enabled }` plus `title` at the document level. `validateForm` requires `amount > 0`. Uses `key="reward.rules.primary"`, `type="integration_config"` against `/api/config/admin/integration/documents` (create) and `/api/config/admin/integration/documents/reward.rules.primary/draft` (update) and `.../publish`. Show an "Active rule" indicator (published amount + channel + enabled). Use existing `Input`, `Select`, `Button`, `Badge` primitives. No raw hex.

- [ ] **Step 2: Add a preview section**

In `dashboard/app/previews/components/IntegrationWorkspacePreview.tsx`, add a "Reward Rules" section rendering `RewardRulesWorkspace` (empty + populated states).

- [ ] **Step 3: Build**

Run: `npm run build -w @shetrades/dashboard`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/integration/RewardRulesWorkspace.tsx dashboard/app/previews/components/IntegrationWorkspacePreview.tsx
git commit -m "feat(rewards): RewardRulesWorkspace settings form + preview"
```

---

## Task 13: Register the Rewards tab in settings

**Files:**
- Modify: `dashboard/app/(admin)/settings/page.tsx`

- [ ] **Step 1: Extend the tab type and registry**

In `dashboard/app/(admin)/settings/page.tsx`:
- Change `type SettingsTabId = "options" | "legal" | "integration";` to add `| "rewards"`.
- Add to `TABS_BY_ID`:
```ts
  rewards: {
    id: "rewards",
    titleKey: "settings.tab.rewards",
    titleFallback: "Rewards",
    hintKey: "settings.tab.rewards.hint",
    hintFallback: "Reward amount and delivery"
  }
```
- Change `const TABS = [TABS_BY_ID.options, TABS_BY_ID.legal, TABS_BY_ID.integration];` to append `TABS_BY_ID.rewards` at the end.
- Update `resolveActiveTab` to accept `"rewards"`: add `|| raw === "rewards"` to the guard and the return type.

- [ ] **Step 2: Render the workspace for the rewards tab**

Add the import:
```ts
import { RewardRulesWorkspace } from "../../../components/integration/RewardRulesWorkspace";
```

In the body where `activeTabId === "integration"` renders `<IntegrationSettingsWorkspace />`, add a sibling branch:
```tsx
{activeTabId === "rewards" ? <RewardRulesWorkspace /> : null}
```

- [ ] **Step 3: Build**

Run: `npm run build -w @shetrades/dashboard`
Expected: build succeeds; `/settings?tab=rewards` resolves.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/\(admin\)/settings/page.tsx
git commit -m "feat(settings): add Rewards tab after Integration"
```

---

## Task 14: Full verification + handoff log

**Files:**
- Modify: `handoff.md`
- Modify: `task-list.md`

- [ ] **Step 1: Monorepo typecheck**

Run: `npm run typecheck`
Expected: backend + dashboard + shared all pass.

- [ ] **Step 2: Dashboard build**

Run: `npm run build -w @shetrades/dashboard`
Expected: success.

- [ ] **Step 3: Backend schema/config tests (DB-free subset)**

Run: `npx tsx --test backend/src/config-platform/reward-rules.test.ts backend/src/routes/config-admin-auth.test.ts`
Expected: pass. (DB-backed tests — users-detail, flag, export — run in CI with Postgres.)

- [ ] **Step 4: Update `handoff.md`**

Add a `### 2026-06-04: /users functionality + Reward Rules tab` entry under Recent Fixes summarizing: the three users endpoints, the two new User columns, the LearnerDetailDrawer + wired actions, the Reward Rules config doc + handler consumption + settings tab. Note the deploy requirement (Cloud Run redeploy for the new backend endpoints/columns; the `ensurePrismaTables` bootstrap adds the columns on boot). Note that `reward.rules.primary` has no published doc yet → env fallback remains in effect until an admin publishes one.

- [ ] **Step 5: Update `task-list.md`**

Mark the /users functionality + reward rules work complete with a one-line summary.

- [ ] **Step 6: Commit**

```bash
git add handoff.md task-list.md
git commit -m "docs: log /users functionality + reward rules in handoff and task list"
```

- [ ] **Step 7: Deploy backend to staging (operational)**

Run: `gcloud run deploy shetrades-backend-staging --source . --region us-central1 --env-vars-file cloudrun-staging-env.yaml --update-secrets PAYOUTS_WORKER_TOKEN=payouts-worker-token:latest --quiet`
Expected: new revision serving 100%. The boot-time `ensurePrismaTables` adds the two user columns; verify `GET /api/admin/users` still returns 200 and `GET /api/admin/users/export` returns CSV.

---

## Self-Review

**Spec coverage:**
- §2.1.1 detail endpoint → Tasks 3, 4.
- §2.1.2 flag endpoint + schema fields → Tasks 1, 5.
- §2.1.3 export → Task 6.
- §2.1.4 row shape → Task 2.
- §2.2 frontend (client component, drawer, row actions, header buttons, client API) → Tasks 7, 8, 9.
- §3.1 reward rule schema + runtime + handler → Tasks 10, 11.
- §3.2 settings tab + workspace → Tasks 12, 13.
- §4 data model → Tasks 1, 2.
- §6 testing → tests embedded in Tasks 3, 4, 5, 6, 8, 10.
- §7 acceptance → Task 14 verification + the per-task tests.

**Placeholder scan:** No TBD/TODO. The DB-dependent tests are explicitly flagged as CI-run where Postgres is present, matching the existing worker/admin test situation — not a placeholder, an environment note. The `request`/`fetchWithFallback` adaptation note in Task 7 points the engineer to match the existing helper signatures (which the rewards endpoints already use) rather than inventing them.

**Type consistency:** `LearnerDetail` is defined once (Task 3) and mirrored in Task 7; `flaggedForFollowUp` is used consistently across Tasks 1, 2, 7, 9; `rewardRulesPayloadSchema` / `RewardRulesPayload` consistent across Tasks 10, 11, 12; `getRuntimeRewardRules` consistent across Tasks 10, 11.

**Route-ordering note:** Tasks 4/5/6 explicitly call out registering `/users/export` and `/users/:phone/flag` before `/users/:phone` so the param route does not shadow the specific paths. Task 6 Step 4 re-verifies the order.
