# Completion Certificates — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue one completion certificate per learner who finishes every module, delivered as an image in WhatsApp with a public verification page behind it.

**Architecture:** A learner becomes eligible on the existing `module_completed` event via `countCompletedModules()`. The bot confirms the name, then a row is written to `certificates` capturing an immutable snapshot of everything printed. Two public routes render the certificate — `GET /c/:publicId` (HTML verify page) and `GET /c/:publicId.png` (the image, which is also the URL handed to Meta, since the Cloud API fetches `image: { link }` itself). Rendering composites a background asset, positioned logo assets and one SVG text layer with `sharp`. Layout lives in a `certificate.template` config document using normalised 0..1 coordinates.

**Tech Stack:** TypeScript ESM, Express, Prisma + Postgres, Zod, `sharp` (image compositing), `qrcode` (SVG QR), `node:test` + `assert/strict`, Next.js dashboard.

**Spec:** `docs/superpowers/specs/2026-08-18-certificates-design.md`

---

## Conventions you must follow

Read these before Task 1. They are house rules this codebase already enforces, and violating them produces code that compiles but breaks at runtime.

1. **ESM imports carry `.js` extensions** even for TypeScript files: `import { x } from "./core.js"`.
2. **`exactOptionalPropertyTypes: true`.** An optional property that may be `undefined` must be typed `foo?: string | undefined`, and conditional spreads are the house pattern: `...(x ? { foo: x } : {})`.
3. **Database columns are camelCase, not snake_case.** The design spec wrote `public_id` for readability; the codebase quotes camelCase columns (`"firstFailureAt"`, `"lockedUntil"`). **Use camelCase.** Table names are snake_case via `@@map`.
4. **New tables need three things in sync:** the Prisma model, a migration under `backend/prisma/migrations/`, and a mirror in `ensurePrismaTables()` in `backend/src/admin/prisma.ts`. The bootstrap mirror is what makes a fresh staging database work.
5. **Tests run with:** `npx tsx --test src/path/file.test.ts` from `backend/`. Use `node:test` and `node:assert/strict`.
6. **Nothing user-visible is hardcoded.** Strings go in config documents; layout values go in the template document.
7. **Commit after every task.** Messages explain *why*, not what.

---

## File structure

**Create — `backend/src/certificates/` (new module, one responsibility each):**

| File | Responsibility |
|---|---|
| `core.ts` | Pure: eligibility predicate, name sanitisation, public-id generation, snapshot assembly |
| `contracts.ts` | Zod schema + types for the `certificate.template` payload |
| `layout.ts` | Pure: coordinate denormalisation, logo box maths, auto-shrink, XML escaping, SVG layer construction |
| `render.ts` | Impure: loads assets, composites with `sharp` |
| `assets.ts` | Asset lookup by key, plus the seed loader that reads files from disk |
| `service.ts` | Orchestration: issue, resend, lookup — the only file that touches both DB and WhatsApp |
| `routes-public.ts` | `GET /c/:publicId`, `GET /c/:publicId.png` |
| `routes-admin.ts` | Admin CRUD, revoke, resend, manual issue |

Each gets a sibling `*.test.ts`. The pure files (`core`, `contracts`, `layout`) carry the bulk of the tests because they need no database.

**Modify:**

- `backend/prisma/schema.prisma` — two models
- `backend/src/admin/prisma.ts` — bootstrap mirror
- `backend/src/config-platform/contracts.ts` — register the document type
- `backend/src/config-platform/runtime-config.ts` — `getRuntimeCertificateTemplate()`
- `backend/src/whatsapp/sender.ts` — image message support
- `backend/src/whatsapp/handler.ts` — two conversation states, conditional menu row, issuing hook
- `backend/src/app.ts` — mount the two new routers
- `backend/src/routes/admin.ts` — extend the learner detail payload
- `dashboard/` — Certificates table, `/users` drawer link

**Assets:**

- `backend/assets/certificates/placeholder-background.png`
- `backend/assets/certificates/placeholder-logo.png`

---

### Task 1: Schema, migration and bootstrap mirror

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260818150000_certificates/migration.sql`
- Modify: `backend/src/admin/prisma.ts` (inside `ensurePrismaTables`)

- [ ] **Step 1: Add the Prisma models**

Append to `backend/prisma/schema.prisma`:

```prisma
model Certificate {
  id               String    @id @default(uuid())
  publicId         String    @unique
  userId           String    @unique
  user             User      @relation(fields: [userId], references: [id])
  learnerName      String
  programmeName    String
  modulesCompleted Int
  totalModules     Int
  issuedAt         DateTime  @default(now())
  revokedAt        DateTime?
  revokedReason    String?
  revokedBy        String?
  templateKey      String
  templateVersion  Int
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([issuedAt])
  @@map("certificates")
}

model CertificateAsset {
  id         String   @id @default(uuid())
  key        String   @unique
  kind       String
  mimeType   String
  bytes      Bytes
  width      Int
  height     Int
  checksum   String
  uploadedBy String
  uploadedAt DateTime @default(now())

  @@map("certificate_assets")
}
```

Add the back-relation to the existing `User` model, alongside `rewards`:

```prisma
  certificate  Certificate?
```

- [ ] **Step 2: Write the migration**

Create `backend/prisma/migrations/20260818150000_certificates/migration.sql`:

```sql
CREATE TABLE IF NOT EXISTS "certificates" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learnerName" TEXT NOT NULL,
    "programmeName" TEXT NOT NULL,
    "modulesCompleted" INTEGER NOT NULL,
    "totalModules" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "revokedBy" TEXT,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "certificates_publicId_key" ON "certificates"("publicId");
CREATE UNIQUE INDEX IF NOT EXISTS "certificates_userId_key" ON "certificates"("userId");
CREATE INDEX IF NOT EXISTS "certificates_issuedAt_idx" ON "certificates"("issuedAt");

CREATE TABLE IF NOT EXISTS "certificate_assets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certificate_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "certificate_assets_key_key" ON "certificate_assets"("key");
```

Note the foreign key is deliberately omitted from the migration to match how `rewards` and `user_progress` were bootstrapped in this codebase — the relation is enforced by Prisma at the application layer.

- [ ] **Step 3: Mirror both tables in the bootstrap**

In `backend/src/admin/prisma.ts`, inside `ensurePrismaTables()`, after the `auth_throttle` block:

```ts
    // certificates — completion certificates. Every printed value is a
    // SNAPSHOT taken at issue time: computing completion live would mean a
    // curriculum change silently rewrites every certificate ever issued.
    // Keep in sync with schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS certificates (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["publicId", "TEXT"],
      ["userId", "TEXT"],
      ["learnerName", "TEXT"],
      ["programmeName", "TEXT"],
      ["modulesCompleted", "INTEGER NOT NULL DEFAULT 0"],
      ["totalModules", "INTEGER NOT NULL DEFAULT 0"],
      ["issuedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["revokedAt", "TIMESTAMP(3)"],
      ["revokedReason", "TEXT"],
      ["revokedBy", "TEXT"],
      ["templateKey", "TEXT"],
      ["templateVersion", "INTEGER NOT NULL DEFAULT 1"],
      ["createdAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"],
      ["updatedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE certificates ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    // One certificate per learner; the issue path relies on this to make
    // concurrent module_completed events idempotent.
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS certificates_publicId_key ON certificates ("publicId");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS certificates_userId_key ON certificates ("userId");`
    );

    // certificate_assets — background artwork and logos. Held in Postgres
    // rather than a bucket: a handful of images does not justify a GCS
    // bucket, IAM policy and CORS config.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS certificate_assets (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["key", "TEXT"],
      ["kind", "TEXT"],
      ["mimeType", "TEXT"],
      ["bytes", "BYTEA"],
      ["width", "INTEGER NOT NULL DEFAULT 0"],
      ["height", "INTEGER NOT NULL DEFAULT 0"],
      ["checksum", "TEXT"],
      ["uploadedBy", "TEXT"],
      ["uploadedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE certificate_assets ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS certificate_assets_key_key ON certificate_assets ("key");`
    );
```

- [ ] **Step 4: Regenerate the Prisma client and typecheck**

Run from `backend/`:

```bash
npx prisma generate && npm run typecheck
```

Expected: `Generated Prisma Client`, then typecheck exits 0 with no output.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/admin/prisma.ts
git commit -m "feat(certificates): schema for certificates and assets

Every printed value is a column, not a join, because a certificate must
keep saying what was true the day it was earned even as the curriculum
changes underneath it."
```

---

### Task 2: Pure core — eligibility, name sanitisation, public id

**Files:**
- Create: `backend/src/certificates/core.ts`
- Test: `backend/src/certificates/core.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/certificates/core.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NAME_LENGTH,
  generatePublicId,
  isEligible,
  sanitiseLearnerName
} from "./core.js";

test("eligible only when every module is complete", () => {
  assert.equal(isEligible({ completedModules: 5, totalModules: 5 }), true);
  assert.equal(isEligible({ completedModules: 4, totalModules: 5 }), false);
});

test("an empty curriculum is never eligible", () => {
  // Guards the window where no lessons are published yet: 0 >= 0 is true,
  // which would hand a certificate to anyone who said hello.
  assert.equal(isEligible({ completedModules: 0, totalModules: 0 }), false);
});

test("names are trimmed but never re-cased", () => {
  // Nigerian names carry legitimate irregular casing; "correcting" them
  // would be confidently wrong.
  assert.deepEqual(sanitiseLearnerName("  chukwuEMEKA  "), {
    ok: true,
    value: "chukwuEMEKA"
  });
});

test("empty and whitespace-only names are rejected", () => {
  assert.deepEqual(sanitiseLearnerName("   "), { ok: false, reason: "empty" });
});

test("control and zero-width characters are stripped", () => {
  assert.deepEqual(sanitiseLearnerName("Ada ​Okeke"), {
    ok: true,
    value: "AdaOkeke"
  });
});

test("names longer than the cap are rejected, not silently truncated", () => {
  // Truncation would print "Oluwafunmilayo Adebayo-Ogundi" on a permanent
  // credential; better to ask again.
  const tooLong = "a".repeat(MAX_NAME_LENGTH + 1);
  assert.deepEqual(sanitiseLearnerName(tooLong), { ok: false, reason: "too_long" });
});

test("a name exactly at the cap is accepted", () => {
  const exact = "a".repeat(MAX_NAME_LENGTH);
  assert.deepEqual(sanitiseLearnerName(exact), { ok: true, value: exact });
});

test("public ids are 32 chars of lowercase base32 and do not repeat", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const id = generatePublicId();
    assert.match(id, /^[a-z2-7]{32}$/);
    assert.equal(seen.has(id), false);
    seen.add(id);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx tsx --test src/certificates/core.test.ts
```

Expected: FAIL — `Cannot find module './core.js'`.

- [ ] **Step 3: Implement the core**

Create `backend/src/certificates/core.ts`:

```ts
import { randomBytes } from "node:crypto";

/**
 * Pure certificate rules. No database, no config, no clock — so the parts
 * that decide who gets a permanent credential are trivially testable.
 */

/** Fits the artwork at the smallest supported auto-shrink size. */
export const MAX_NAME_LENGTH = 60;

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export type Completion = { completedModules: number; totalModules: number };

/**
 * A learner earns a certificate only when every published module is done.
 * `totalModules > 0` is load-bearing: before any lessons are published both
 * counts are zero, and a bare `>=` would issue a certificate to anyone who
 * had merely started a conversation.
 */
export function isEligible({ completedModules, totalModules }: Completion): boolean {
  return totalModules > 0 && completedModules >= totalModules;
}

export type SanitiseResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_long" };

/**
 * Clean a learner-supplied name for printing. Deliberately does NOT change
 * capitalisation — see the test for why.
 *
 * Over-long names are REJECTED rather than truncated: this string is printed
 * on a permanent credential, and half a name is worse than another prompt.
 */
export function sanitiseLearnerName(raw: string): SanitiseResult {
  // Strip C0/C1 control characters and zero-width joiners/spaces, which are
  // invisible in a chat but corrupt the SVG text layer.
  const stripped = raw.replace(/[ --​-‏﻿]/g, "");
  const trimmed = stripped.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_NAME_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, value: trimmed };
}

/**
 * 32 chars of CSPRNG base32 — 160 bits. Unguessable, so certificates cannot
 * be enumerated by walking ids. Lowercase and digit-restricted so it survives
 * being read aloud or retyped from a printout.
 */
export function generatePublicId(): string {
  const bytes = randomBytes(32);
  let out = "";
  for (const byte of bytes) {
    out += BASE32_ALPHABET[byte % 32];
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx tsx --test src/certificates/core.test.ts
```

Expected: PASS — `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/certificates/core.ts backend/src/certificates/core.test.ts
git commit -m "feat(certificates): pure eligibility and name rules

totalModules > 0 is the guard that matters: before any lessons are
published both counts are zero, and a bare >= would hand a certificate to
anyone who said hello."
```

---

### Task 3: Template contract and runtime getter

**Files:**
- Create: `backend/src/certificates/contracts.ts`
- Test: `backend/src/certificates/contracts.test.ts`
- Modify: `backend/src/config-platform/contracts.ts`
- Modify: `backend/src/config-platform/runtime-config.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/certificates/contracts.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { certificateTemplatePayloadSchema } from "./contracts.js";

const VALID = {
  kind: "certificate_template",
  enabled: false,
  programmeName: "SheTrades Digital Skills Programme",
  issuerName: "TechHer",
  assetKey: "cert-bg-placeholder",
  canvas: { width: 2000, height: 1414 },
  fields: [
    {
      id: "learner-name",
      variable: "learnerName",
      x: 0.5,
      y: 0.52,
      maxWidth: 0.7,
      align: "center",
      font: "Playfair Display",
      size: 0.06,
      weight: 600,
      color: "#1a1a1a",
      autoShrink: true
    }
  ]
};

test("a well-formed template parses", () => {
  const parsed = certificateTemplatePayloadSchema.parse(VALID);
  assert.equal(parsed.fields[0]?.variable, "learnerName");
});

test("coordinates outside 0..1 are rejected", () => {
  // Pixel coordinates would render correctly on the authoring canvas and
  // wrongly at print resolution — catch them at the publish boundary.
  const bad = { ...VALID, fields: [{ ...VALID.fields[0], x: 400 }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("an unknown variable is rejected", () => {
  const bad = { ...VALID, fields: [{ ...VALID.fields[0], variable: "learnerEmail" }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("a logo field requires its own assetKey", () => {
  const bad = {
    ...VALID,
    fields: [{ id: "logo-1", variable: "logo", x: 0.1, y: 0.1, width: 0.2 }]
  };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("a logo field with an assetKey parses", () => {
  const good = {
    ...VALID,
    fields: [
      { id: "logo-1", variable: "logo", assetKey: "logo-techher", x: 0.1, y: 0.1, width: 0.2 }
    ]
  };
  const parsed = certificateTemplatePayloadSchema.parse(good);
  assert.equal(parsed.fields[0]?.variable, "logo");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx tsx --test src/certificates/contracts.test.ts
```

Expected: FAIL — `Cannot find module './contracts.js'`.

- [ ] **Step 3: Implement the contract**

Create `backend/src/certificates/contracts.ts`:

```ts
import { z } from "zod";

/**
 * Layout contract for the `certificate.template` config document.
 *
 * Coordinates are NORMALISED 0..1 against the canvas, never pixels. A
 * template authored against an 800px preview must render identically at
 * print resolution; storing pixels produces an off-by-a-bit bug that
 * presents as "the name looks slightly wrong" and is miserable to diagnose.
 */

const normalised = z.number().min(0).max(1);

const textVariableSchema = z.enum([
  "learnerName",
  "programmeName",
  "issuedDate",
  "certificateId"
]);

const textFieldSchema = z.object({
  id: z.string().min(1),
  variable: textVariableSchema,
  x: normalised,
  y: normalised,
  maxWidth: normalised.default(0.8),
  align: z.enum(["left", "center", "right"]).default("center"),
  font: z.string().min(1),
  size: normalised,
  weight: z.number().int().min(100).max(900).default(400),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  autoShrink: z.boolean().default(true)
});

/** Logos and QR codes are placed images, sized by width with aspect preserved. */
const imageFieldSchema = z.object({
  id: z.string().min(1),
  variable: z.enum(["logo", "qrCode"]),
  // Repeatable by design: several partner marks can sit independently, so
  // one partner's rebrand touches exactly one field.
  assetKey: z.string().min(1).optional(),
  x: normalised,
  y: normalised,
  width: normalised,
  align: z.enum(["left", "center", "right"]).default("left"),
  opacity: z.number().min(0).max(1).default(1)
}).refine(
  (field) => field.variable !== "logo" || Boolean(field.assetKey),
  { message: "A logo field must name the assetKey it renders", path: ["assetKey"] }
);

export const certificateFieldSchema = z.union([textFieldSchema, imageFieldSchema]);
export type CertificateField = z.infer<typeof certificateFieldSchema>;

export const certificateTemplatePayloadSchema = z.object({
  kind: z.literal("certificate_template"),
  // Ships false. This flag is what stops placeholder artwork ever reaching
  // a learner before the real design is seeded.
  enabled: z.boolean(),
  programmeName: z.string().trim().min(1).max(120),
  issuerName: z.string().trim().min(1).max(120),
  assetKey: z.string().min(1),
  canvas: z.object({
    width: z.number().int().min(200).max(8000),
    height: z.number().int().min(200).max(8000)
  }),
  fields: z.array(certificateFieldSchema).min(1).max(20)
});
export type CertificateTemplatePayload = z.infer<typeof certificateTemplatePayloadSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx tsx --test src/certificates/contracts.test.ts
```

Expected: PASS — `# pass 5`, `# fail 0`.

- [ ] **Step 5: Register the document type in the config platform**

In `backend/src/config-platform/contracts.ts`, extend the document type enum:

```ts
export const configDocumentTypeSchema = z.enum([
  "lesson_content",
  "option_set",
  "legal_block",
  "ui_copy",
  "integration_config",
  "certificate_template"
]);
```

Then find the payload validator (search for `validatePayloadForDocumentType`) and add a `certificate_template` branch that parses with `certificateTemplatePayloadSchema`, importing it from `../certificates/contracts.js`. Add the schema to the `configPayloadSchema` union as well, ahead of the `z.record` catch-all — otherwise the publish path will accept malformed templates by falling through.

- [ ] **Step 6: Add the runtime getter**

In `backend/src/config-platform/runtime-config.ts`, next to `getRuntimeRewardRules()`:

```ts
export function getRuntimeCertificateTemplate() {
  return getRuntimeIntegrationConfig<CertificateTemplatePayload>("certificate.template");
}
```

Import the type at the top of the file:

```ts
import type { CertificateTemplatePayload } from "../certificates/contracts.js";
```

- [ ] **Step 7: Typecheck and run the config-platform tests**

```bash
npm run typecheck && npx tsx --test src/config-platform/*.test.ts
```

Expected: typecheck clean; config-platform tests still pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/certificates/contracts.ts backend/src/certificates/contracts.test.ts backend/src/config-platform/contracts.ts backend/src/config-platform/runtime-config.ts
git commit -m "feat(certificates): template layout contract

Coordinates are normalised 0..1 and rejected outside it. Pixel coordinates
render correctly on the authoring canvas and wrongly at print resolution -
the kind of bug that presents as 'slightly off' and resists diagnosis."
```

---

### Task 4: Layout maths and the SVG text layer

**Files:**
- Create: `backend/src/certificates/layout.ts`
- Test: `backend/src/certificates/layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/certificates/layout.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildTextLayerSvg, escapeXml, fitFontSize, placeImage } from "./layout.js";

const CANVAS = { width: 2000, height: 1414 };

test("xml special characters are escaped", () => {
  assert.equal(escapeXml(`Ada & <b>Sons</b>`), "Ada &amp; &lt;b&gt;Sons&lt;/b&gt;");
});

test("a name containing a closing text tag cannot break out of the layer", () => {
  // The one place hostile input reaches a parser. Unescaped, this would
  // terminate the <text> element and let arbitrary SVG in.
  const svg = buildTextLayerSvg(CANVAS, [
    {
      id: "n",
      variable: "learnerName",
      x: 0.5, y: 0.5, maxWidth: 0.8, align: "center",
      font: "Inter", size: 0.05, weight: 600, color: "#000000", autoShrink: true
    }
  ], { learnerName: "</text><script>x</script>", programmeName: "P", issuedDate: "1 Jan 2026", certificateId: "abc" });

  assert.equal(svg.includes("<script>"), false);
  assert.equal(svg.includes("&lt;/text&gt;"), true);
});

test("font size shrinks until the text fits the max width", () => {
  const wide = fitFontSize({ text: "a".repeat(60), startPx: 100, maxWidthPx: 400 });
  const narrow = fitFontSize({ text: "Ada", startPx: 100, maxWidthPx: 400 });
  assert.ok(wide < narrow, "a longer string must end up at a smaller size");
  assert.equal(narrow, 100, "text that already fits is never shrunk");
});

test("font size never descends below the floor", () => {
  const tiny = fitFontSize({ text: "a".repeat(500), startPx: 100, maxWidthPx: 50 });
  assert.ok(tiny >= 24, "must stop at the legibility floor rather than vanish");
});

test("an image is placed with its aspect ratio preserved", () => {
  const box = placeImage(CANVAS, { x: 0.1, y: 0.2, width: 0.2, align: "left" }, { width: 400, height: 200 });
  assert.equal(box.width, 400);            // 0.2 * 2000
  assert.equal(box.height, 200);           // aspect 2:1 preserved
  assert.equal(box.left, 200);             // 0.1 * 2000
  assert.equal(box.top, Math.round(0.2 * 1414));
});

test("a centre-aligned image is offset by half its width", () => {
  const box = placeImage(CANVAS, { x: 0.5, y: 0.1, width: 0.2, align: "center" }, { width: 400, height: 200 });
  assert.equal(box.left, 1000 - 200);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx tsx --test src/certificates/layout.test.ts
```

Expected: FAIL — `Cannot find module './layout.js'`.

- [ ] **Step 3: Implement the layout module**

Create `backend/src/certificates/layout.ts`:

```ts
/**
 * Pure layout maths and SVG construction. Kept free of I/O so the parts most
 * likely to be wrong — escaping and coordinate arithmetic — are unit-testable
 * without a database, an image library or a font.
 */

export type Canvas = { width: number; height: number };

export type TextValues = {
  learnerName: string;
  programmeName: string;
  issuedDate: string;
  certificateId: string;
};

export type TextFieldSpec = {
  id: string;
  variable: keyof TextValues;
  x: number;
  y: number;
  maxWidth: number;
  align: "left" | "center" | "right";
  font: string;
  size: number;
  weight: number;
  color: string;
  autoShrink: boolean;
};

/** Below this the text stops being a credential and starts being a smudge. */
const MIN_FONT_PX = 24;

/**
 * Average glyph width as a fraction of font size. A real text-shaping pass
 * would need the font metrics; this approximation is deliberately slightly
 * pessimistic so text lands inside its box rather than a pixel outside it.
 */
const AVG_GLYPH_RATIO = 0.55;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Shrink until the string fits, then stop. Long names
 * ("Oluwafunmilayo Adebayo-Ogundimu") must degrade gracefully rather than
 * collide with the border.
 */
export function fitFontSize(input: {
  text: string;
  startPx: number;
  maxWidthPx: number;
}): number {
  const { text, startPx, maxWidthPx } = input;
  let size = startPx;
  while (size > MIN_FONT_PX && text.length * size * AVG_GLYPH_RATIO > maxWidthPx) {
    size -= 1;
  }
  return Math.max(size, MIN_FONT_PX);
}

export type ImageFieldSpec = {
  x: number;
  y: number;
  width: number;
  align: "left" | "center" | "right";
};

export type PlacedBox = { left: number; top: number; width: number; height: number };

/**
 * Denormalise an image field against the canvas, preserving the asset's own
 * aspect ratio — a stretched partner logo is worse than no logo.
 */
export function placeImage(
  canvas: Canvas,
  field: ImageFieldSpec,
  asset: { width: number; height: number }
): PlacedBox {
  const width = Math.round(field.width * canvas.width);
  const height = Math.round(width * (asset.height / asset.width));
  const anchorX = Math.round(field.x * canvas.width);
  const left =
    field.align === "center" ? anchorX - Math.round(width / 2)
    : field.align === "right" ? anchorX - width
    : anchorX;
  return { left, top: Math.round(field.y * canvas.height), width, height };
}

const ANCHOR: Record<TextFieldSpec["align"], string> = {
  left: "start",
  center: "middle",
  right: "end"
};

/**
 * Build the single SVG layer carrying every text field. Values are escaped
 * here, at the boundary where learner-supplied input meets an XML parser.
 */
export function buildTextLayerSvg(
  canvas: Canvas,
  fields: readonly TextFieldSpec[],
  values: TextValues
): string {
  const elements = fields.map((field) => {
    const raw = values[field.variable] ?? "";
    const startPx = Math.round(field.size * canvas.height);
    const maxWidthPx = Math.round(field.maxWidth * canvas.width);
    const fontPx = field.autoShrink
      ? fitFontSize({ text: raw, startPx, maxWidthPx })
      : startPx;
    return [
      `<text x="${Math.round(field.x * canvas.width)}"`,
      `y="${Math.round(field.y * canvas.height)}"`,
      `text-anchor="${ANCHOR[field.align]}"`,
      `font-family="${escapeXml(field.font)}"`,
      `font-size="${fontPx}"`,
      `font-weight="${field.weight}"`,
      `fill="${escapeXml(field.color)}">${escapeXml(raw)}</text>`
    ].join(" ");
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${elements.join("")}</svg>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx tsx --test src/certificates/layout.test.ts
```

Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/certificates/layout.ts backend/src/certificates/layout.test.ts
git commit -m "feat(certificates): layout maths and escaped SVG text layer

Escaping is tested against a name containing a closing text tag: this is
the one place learner-supplied input reaches a parser, and unescaped it
would let arbitrary SVG into the layer."
```

---

### Task 5: Renderer

**Files:**
- Create: `backend/src/certificates/assets.ts`
- Create: `backend/src/certificates/render.ts`
- Test: `backend/src/certificates/render.test.ts`
- Modify: `backend/package.json` (add `sharp`, `qrcode`)

- [ ] **Step 1: Add the dependencies**

Run from the repo root:

```bash
npm install sharp qrcode -w @shetrades/backend && npm install --save-dev @types/qrcode -w @shetrades/backend
```

`sharp` ships prebuilt linux-x64 binaries and the Docker base image is `node:24-slim` (Debian, glibc), so no extra apt packages are needed.

- [ ] **Step 2: Write the failing test**

Create `backend/src/certificates/render.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { renderCertificatePng } from "./render.js";

/** A solid background stands in for the artwork; we assert geometry, not pixels. */
async function backgroundPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 250, g: 250, b: 250, alpha: 1 } }
  }).png().toBuffer();
}

const TEMPLATE = {
  kind: "certificate_template" as const,
  enabled: true,
  programmeName: "SheTrades Digital Skills Programme",
  issuerName: "TechHer",
  assetKey: "bg",
  canvas: { width: 1000, height: 700 },
  fields: [
    {
      id: "name",
      variable: "learnerName" as const,
      x: 0.5, y: 0.5, maxWidth: 0.8, align: "center" as const,
      font: "DejaVu Sans", size: 0.06, weight: 600, color: "#1a1a1a", autoShrink: true
    }
  ]
};

test("renders a png at the template canvas size", async () => {
  const png = await renderCertificatePng({
    template: TEMPLATE,
    values: {
      learnerName: "Adaeze Okonkwo",
      programmeName: TEMPLATE.programmeName,
      issuedDate: "18 August 2026",
      certificateId: "abc123"
    },
    verifyUrl: "https://example.test/c/abc123",
    loadAsset: async () => ({ bytes: await backgroundPng(1000, 700), width: 1000, height: 700 })
  });
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1000);
  assert.equal(meta.height, 700);
});

test("a missing background fails loudly rather than producing a blank image", async () => {
  // A silently blank certificate would be issued, sent and believed.
  await assert.rejects(
    renderCertificatePng({
      template: TEMPLATE,
      values: {
        learnerName: "Adaeze Okonkwo",
        programmeName: TEMPLATE.programmeName,
        issuedDate: "18 August 2026",
        certificateId: "abc123"
      },
      verifyUrl: "https://example.test/c/abc123",
      loadAsset: async () => null
    }),
    /asset/i
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx tsx --test src/certificates/render.test.ts
```

Expected: FAIL — `Cannot find module './render.js'`.

- [ ] **Step 4: Implement the asset loader**

Create `backend/src/certificates/assets.ts`:

```ts
import { prisma } from "../admin/prisma.js";

export type LoadedAsset = { bytes: Buffer; width: number; height: number };

/** Injected into the renderer so it can be tested without a database. */
export type AssetLoader = (key: string) => Promise<LoadedAsset | null>;

export const loadAssetFromDb: AssetLoader = async (key) => {
  const row = await prisma.certificateAsset.findUnique({ where: { key } });
  if (!row) return null;
  return { bytes: Buffer.from(row.bytes), width: row.width, height: row.height };
};
```

- [ ] **Step 5: Implement the renderer**

Create `backend/src/certificates/render.ts`:

```ts
import sharp from "sharp";
import QRCode from "qrcode";
import type { CertificateTemplatePayload } from "./contracts.js";
import type { AssetLoader } from "./assets.js";
import { buildTextLayerSvg, placeImage, type TextFieldSpec, type TextValues } from "./layout.js";

export type RenderInput = {
  template: CertificateTemplatePayload;
  values: TextValues;
  verifyUrl: string;
  loadAsset: AssetLoader;
};

function isImageField(field: { variable: string }): boolean {
  return field.variable === "logo" || field.variable === "qrCode";
}

/**
 * Composite the certificate: background, then any placed images (partner
 * logos, QR), then one SVG layer carrying all the text.
 */
export async function renderCertificatePng(input: RenderInput): Promise<Buffer> {
  const { template, values, verifyUrl, loadAsset } = input;

  const background = await loadAsset(template.assetKey);
  if (!background) {
    // Loud on purpose: a blank certificate would be issued, sent and
    // believed. Better a 500 an admin can see.
    throw new Error(`Certificate background asset "${template.assetKey}" is missing`);
  }

  const canvas = template.canvas;
  const overlays: sharp.OverlayOptions[] = [];

  for (const field of template.fields) {
    if (!isImageField(field)) continue;
    const imageField = field as unknown as {
      variable: "logo" | "qrCode";
      assetKey?: string;
      x: number; y: number; width: number;
      align: "left" | "center" | "right";
    };

    let bytes: Buffer;
    let natural: { width: number; height: number };

    if (imageField.variable === "qrCode") {
      const svg = await QRCode.toString(verifyUrl, { type: "svg", margin: 0 });
      bytes = Buffer.from(svg);
      natural = { width: 1, height: 1 }; // QR is square by definition
    } else {
      const asset = imageField.assetKey ? await loadAsset(imageField.assetKey) : null;
      if (!asset) {
        throw new Error(`Certificate logo asset "${imageField.assetKey ?? "?"}" is missing`);
      }
      bytes = asset.bytes;
      natural = { width: asset.width, height: asset.height };
    }

    const box = placeImage(canvas, imageField, natural);
    // SVG sources (QR, vector logos) are RASTERISED here rather than inlined
    // into the text layer, so a hand-authored SVG cannot inject elements into
    // the layer carrying learner data.
    const resized = await sharp(bytes).resize(box.width, box.height, { fit: "inside" }).png().toBuffer();
    overlays.push({ input: resized, left: box.left, top: box.top });
  }

  const textFields = template.fields.filter((f) => !isImageField(f)) as unknown as TextFieldSpec[];
  const textLayer = Buffer.from(buildTextLayerSvg(canvas, textFields, values));
  overlays.push({ input: textLayer, left: 0, top: 0 });

  return sharp(background.bytes)
    .resize(canvas.width, canvas.height, { fit: "cover" })
    .composite(overlays)
    .png()
    .toBuffer();
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx tsx --test src/certificates/render.test.ts
```

Expected: PASS — `# pass 2`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/certificates/render.ts backend/src/certificates/render.test.ts backend/src/certificates/assets.ts backend/package.json package-lock.json
git commit -m "feat(certificates): sharp renderer

A missing asset throws rather than rendering blank: a blank certificate
would be issued, sent and believed. SVG sources are rasterised before
compositing so vector logos cannot inject into the learner-data layer."
```

---

### Task 6: Issuing service

**Files:**
- Create: `backend/src/certificates/service.ts`
- Test: `backend/src/certificates/service.test.ts`
- Modify: `backend/src/whatsapp/sender.ts`

- [ ] **Step 1: Add image support to the sender**

In `backend/src/whatsapp/sender.ts`, extend the outreach payload union and message builder:

```ts
export type OutreachPayload =
  | { kind: "text"; text: string }
  | { kind: "template"; templateName: string; languageCode: string }
  // Meta FETCHES this URL itself, so there is no media-upload step: the same
  // public route serves browsers and the Cloud API.
  | { kind: "image"; link: string; caption?: string | undefined };
```

In `sendWhatsAppOutreach`, replace the ternary that builds `message` with:

```ts
  const message =
    payload.kind === "text"
      ? { messaging_product: "whatsapp", to, type: "text", text: { body: payload.text } }
      : payload.kind === "image"
      ? {
          messaging_product: "whatsapp",
          to,
          type: "image",
          image: { link: payload.link, ...(payload.caption ? { caption: payload.caption } : {}) }
        }
      : {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: payload.templateName, language: { code: payload.languageCode } }
        };
```

- [ ] **Step 2: Write the failing tests**

Create `backend/src/certificates/service.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildIssuePlan, certificateUrls } from "./service.js";

const TEMPLATE = {
  kind: "certificate_template" as const,
  enabled: true,
  programmeName: "SheTrades Digital Skills Programme",
  issuerName: "TechHer",
  assetKey: "bg",
  canvas: { width: 1000, height: 700 },
  fields: []
};

test("the plan snapshots the values printed on the certificate", () => {
  // Snapshotting is the whole design: computing these live would mean a
  // curriculum change silently rewrites every certificate ever issued.
  const plan = buildIssuePlan({
    template: TEMPLATE,
    templateVersion: 3,
    learnerName: "Adaeze Okonkwo",
    completion: { completedModules: 5, totalModules: 5 }
  });
  assert.equal(plan.learnerName, "Adaeze Okonkwo");
  assert.equal(plan.programmeName, "SheTrades Digital Skills Programme");
  assert.equal(plan.modulesCompleted, 5);
  assert.equal(plan.totalModules, 5);
  assert.equal(plan.templateVersion, 3);
  assert.match(plan.publicId, /^[a-z2-7]{32}$/);
});

test("an ineligible learner produces no plan", () => {
  assert.equal(
    buildIssuePlan({
      template: TEMPLATE,
      templateVersion: 1,
      learnerName: "Adaeze Okonkwo",
      completion: { completedModules: 4, totalModules: 5 }
    }),
    null
  );
});

test("a disabled template produces no plan", () => {
  // The flag that stops placeholder artwork ever reaching a learner.
  assert.equal(
    buildIssuePlan({
      template: { ...TEMPLATE, enabled: false },
      templateVersion: 1,
      learnerName: "Adaeze Okonkwo",
      completion: { completedModules: 5, totalModules: 5 }
    }),
    null
  );
});

test("urls are derived from the public id", () => {
  const urls = certificateUrls("https://api.example.test", "abc");
  assert.equal(urls.verify, "https://api.example.test/c/abc");
  assert.equal(urls.image, "https://api.example.test/c/abc.png");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx tsx --test src/certificates/service.test.ts
```

Expected: FAIL — `Cannot find module './service.js'`.

- [ ] **Step 4: Implement the service**

Create `backend/src/certificates/service.ts`:

```ts
import { prisma } from "../admin/prisma.js";
import { sendWhatsAppOutreach } from "../whatsapp/sender.js";
import { generatePublicId, isEligible, type Completion } from "./core.js";
import type { CertificateTemplatePayload } from "./contracts.js";

export type IssuePlan = {
  publicId: string;
  learnerName: string;
  programmeName: string;
  modulesCompleted: number;
  totalModules: number;
  templateKey: string;
  templateVersion: number;
};

/**
 * Decide whether a certificate is due and freeze what it will say. Pure, so
 * the snapshot rule is testable without a database.
 */
export function buildIssuePlan(input: {
  template: CertificateTemplatePayload;
  templateVersion: number;
  learnerName: string;
  completion: Completion;
}): IssuePlan | null {
  const { template, templateVersion, learnerName, completion } = input;
  if (!template.enabled) return null;
  if (!isEligible(completion)) return null;
  return {
    publicId: generatePublicId(),
    learnerName,
    programmeName: template.programmeName,
    modulesCompleted: completion.completedModules,
    totalModules: completion.totalModules,
    templateKey: "certificate.template",
    templateVersion
  };
}

export function certificateUrls(baseUrl: string, publicId: string) {
  const root = baseUrl.replace(/\/+$/, "");
  return { verify: `${root}/c/${publicId}`, image: `${root}/c/${publicId}.png` };
}

/**
 * Persist the certificate, THEN send it. This order is load-bearing: if the
 * send fails the certificate still exists and both the "My Certificate" menu
 * entry and the admin Resend action recover it. The reverse order would let
 * a network blip erase something a learner spent weeks earning.
 */
export async function issueCertificate(input: {
  userId: string;
  learnerPhone: string;
  plan: IssuePlan;
  baseUrl: string;
  caption: string;
}): Promise<{ publicId: string; sent: boolean }> {
  const { userId, learnerPhone, plan, baseUrl, caption } = input;

  const row = await prisma.certificate.upsert({
    where: { userId },
    update: {}, // an already-issued certificate is never silently replaced
    create: {
      userId,
      publicId: plan.publicId,
      learnerName: plan.learnerName,
      programmeName: plan.programmeName,
      modulesCompleted: plan.modulesCompleted,
      totalModules: plan.totalModules,
      templateKey: plan.templateKey,
      templateVersion: plan.templateVersion
    }
  });

  const urls = certificateUrls(baseUrl, row.publicId);
  const result = await sendWhatsAppOutreach(learnerPhone, {
    kind: "image",
    link: urls.image,
    caption: `${caption}\n${urls.verify}`
  });

  console.log(
    JSON.stringify({
      event: "certificate.issued",
      userId,
      publicId: row.publicId,
      sent: result.status === "sent",
      ...(result.status === "failed" ? { reason: result.reason } : {})
    })
  );

  return { publicId: row.publicId, sent: result.status === "sent" };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx tsx --test src/certificates/service.test.ts
```

Expected: PASS — `# pass 4`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/certificates/service.ts backend/src/certificates/service.test.ts backend/src/whatsapp/sender.ts
git commit -m "feat(certificates): issuing service and image sends

Row is written before the send. If the send fails the certificate still
exists and the menu entry and admin resend recover it; the reverse order
would let a network blip erase something a learner spent weeks earning."
```

---

### Task 7: Public routes

**Files:**
- Create: `backend/src/certificates/routes-public.ts`
- Test: `backend/src/certificates/routes-public.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/certificates/routes-public.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { buildVerifyPageHtml } from "./routes-public.js";

test("the verify page shows the credential and nothing else", () => {
  const html = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Digital Skills Programme",
    issuerName: "TechHer",
    issuedAt: new Date("2026-08-18T00:00:00.000Z"),
    revokedAt: null,
    imageUrl: "https://example.test/c/abc.png"
  });
  assert.ok(html.includes("Adaeze Okonkwo"));
  assert.ok(html.includes("TechHer"));
  // A woman's phone number and performance record must not sit on an open URL.
  assert.equal(html.includes("234"), false);
});

test("a revoked certificate says so plainly", () => {
  const html = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Digital Skills Programme",
    issuerName: "TechHer",
    issuedAt: new Date("2026-08-18T00:00:00.000Z"),
    revokedAt: new Date("2026-09-01T00:00:00.000Z"),
    imageUrl: "https://example.test/c/abc.png"
  });
  assert.match(html, /revoked/i);
});

test("names are escaped into the page", () => {
  const html = buildVerifyPageHtml({
    learnerName: "<script>alert(1)</script>",
    programmeName: "P",
    issuerName: "T",
    issuedAt: new Date("2026-08-18T00:00:00.000Z"),
    revokedAt: null,
    imageUrl: "https://example.test/c/abc.png"
  });
  assert.equal(html.includes("<script>alert(1)</script>"), false);
});

test("an unknown id returns 404", async () => {
  const { certificatesPublicRouter } = await import("./routes-public.js");
  const app = express();
  app.use("/", certificatesPublicRouter);
  const response = await request(app).get("/c/doesnotexist");
  assert.equal(response.status, 404);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx tsx --test src/certificates/routes-public.test.ts
```

Expected: FAIL — `Cannot find module './routes-public.js'`.

- [ ] **Step 3: Implement the routes**

Create `backend/src/certificates/routes-public.ts`:

```ts
import express from "express";
import { prisma } from "../admin/prisma.js";
import { getRuntimeCertificateTemplate } from "../config-platform/runtime-config.js";
import { escapeXml } from "./layout.js";
import { loadAssetFromDb } from "./assets.js";
import { renderCertificatePng } from "./render.js";
import { certificateUrls } from "./service.js";

export const certificatesPublicRouter = express.Router();

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
}

export function buildVerifyPageHtml(input: {
  learnerName: string;
  programmeName: string;
  issuerName: string;
  issuedAt: Date;
  revokedAt: Date | null;
  imageUrl: string;
}): string {
  const date = input.issuedAt.toISOString().slice(0, 10);
  const revoked = input.revokedAt
    ? `<p class="revoked">This certificate was revoked on ${escapeXml(
        input.revokedAt.toISOString().slice(0, 10)
      )} and is no longer valid.</p>`
    : "";
  // Deliberately minimal: name, programme, date, issuer. Never the phone
  // number, location or quiz scores.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificate — ${escapeXml(input.learnerName)}</title>
<style>
body{margin:0;padding:2rem;font-family:system-ui,sans-serif;background:#faf9f7;color:#1a1a1a}
main{max-width:44rem;margin:0 auto}
img{max-width:100%;height:auto;border:1px solid #e5e2dd;border-radius:.5rem}
.revoked{background:#fdecea;border:1px solid #f5c6cb;padding:1rem;border-radius:.5rem}
dt{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#6b6660;margin-top:1rem}
dd{margin:.25rem 0 0;font-size:1.1rem}
</style></head>
<body><main>
${revoked}
<img src="${escapeXml(input.imageUrl)}" alt="Certificate of completion">
<dl>
<dt>Awarded to</dt><dd>${escapeXml(input.learnerName)}</dd>
<dt>Programme</dt><dd>${escapeXml(input.programmeName)}</dd>
<dt>Issued</dt><dd>${escapeXml(date)}</dd>
<dt>Issued by</dt><dd>${escapeXml(input.issuerName)}</dd>
</dl>
</main></body></html>`;
}

certificatesPublicRouter.get("/c/:publicId.png", async (req, res, next) => {
  try {
    const publicId = String(req.params.publicId);
    const row = await prisma.certificate.findUnique({ where: { publicId } });
    const template = getRuntimeCertificateTemplate();
    if (!row || !template) {
      res.status(404).send("Not found");
      return;
    }
    const png = await renderCertificatePng({
      template,
      values: {
        learnerName: row.learnerName,
        programmeName: row.programmeName,
        issuedDate: row.issuedAt.toISOString().slice(0, 10),
        certificateId: row.publicId
      },
      verifyUrl: certificateUrls(publicBaseUrl(), row.publicId).verify,
      loadAsset: loadAssetFromDb
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(png);
  } catch (error) {
    next(error);
  }
});

certificatesPublicRouter.get("/c/:publicId", async (req, res, next) => {
  try {
    const publicId = String(req.params.publicId);
    const row = await prisma.certificate.findUnique({ where: { publicId } });
    const template = getRuntimeCertificateTemplate();
    if (!row || !template) {
      // Identical response for "never existed" and "exists but hidden", so
      // ids cannot be probed for validity.
      res.status(404).send("Not found");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(
      buildVerifyPageHtml({
        learnerName: row.learnerName,
        programmeName: row.programmeName,
        issuerName: template.issuerName,
        issuedAt: row.issuedAt,
        revokedAt: row.revokedAt,
        imageUrl: certificateUrls(publicBaseUrl(), row.publicId).image
      })
    );
  } catch (error) {
    next(error);
  }
});
```

Note the `.png` route is registered **before** the bare route: Express matches in order, and `/c/:publicId` would otherwise swallow `/c/abc.png` and treat `abc.png` as the id.

- [ ] **Step 4: Mount the router**

In `backend/src/app.ts`, alongside the other `app.use("/", …)` mounts:

```ts
  app.use("/", certificatesPublicRouter);
```

with the import:

```ts
import { certificatesPublicRouter } from "./certificates/routes-public.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx tsx --test src/certificates/routes-public.test.ts && npm run typecheck
```

Expected: PASS — `# pass 4`, `# fail 0`; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/certificates/routes-public.ts backend/src/certificates/routes-public.test.ts backend/src/app.ts
git commit -m "feat(certificates): public verify page and image route

The .png route registers first because Express matches in order and the
bare route would otherwise swallow the extension into the id. Unknown and
hidden ids return identical 404s so ids cannot be probed."
```

---

### Task 8: Bot flow — confirm name, issue, conditional menu row

**Files:**
- Modify: `backend/src/whatsapp/handler.ts`
- Modify: `backend/src/whatsapp/bot-prompts.ts`
- Test: `backend/src/whatsapp/handler.test.ts` (extend)

- [ ] **Step 1: Add the bot copy defaults**

In `backend/src/whatsapp/bot-prompts.ts`, add to `BOT_PROMPT_DEFAULTS` (and matching entries in `BOT_PROMPT_TITLES`):

```ts
  certificate_congrats: {
    en: "🎉 Congratulations! You have completed every module.\n\nYour certificate will show this name:\n*{name}*\n\nIs that correct?"
  },
  certificate_confirm_yes: { en: "Yes, that's right" },
  certificate_confirm_change: { en: "Change name" },
  certificate_name_prompt: {
    en: "What name should appear on your certificate? Please type it exactly as you want it printed."
  },
  certificate_name_too_long: {
    en: "That name is too long to fit the certificate. Please send a shorter version (up to 60 characters)."
  },
  certificate_name_empty: { en: "Please type the name you want on your certificate." },
  certificate_sent: { en: "Here is your certificate. Congratulations! 🎓" },
  certificate_menu_label: { en: "My Certificate" },
  certificate_menu_description: { en: "View or resend your certificate" }
```

- [ ] **Step 2: Extend the conversation state union**

In `backend/src/whatsapp/handler.ts`, line 20:

```ts
export type ConversationState = "awaiting_name" | "awaiting_language" | "awaiting_state" | "awaiting_custom_state" | "main_menu" | "module_menu" | "lesson_menu" | "faq_menu" | "resources_menu" | "awaiting_certificate_confirm" | "awaiting_certificate_name";
```

- [ ] **Step 3: Make the menu row conditional**

Change the `buildMainMenuReply` signature and options list:

```ts
export function buildMainMenuReply(
  name: string,
  lang: "en" | "pcm" | "ig",
  // A permanently visible row would read as a promise to someone on lesson 2,
  // and tapping it would produce a locked door. It appears on completion.
  showCertificate = false
): { reply: string; list: WhatsAppListSpec } {
  const options = [
    { id: "menu-learn", title: "Start Learning", description: "Modules, lessons and quizzes" },
    { id: "menu-progress", title: "My Progress", description: "How far you have come" },
    { id: "menu-language", title: "Change Language", description: "English, Pidgin, Igbo" },
    { id: "menu-faq", title: "FAQs", description: "Common questions, quick answers" },
    { id: "menu-resources", title: "Resources", description: "Helpful links and contacts" },
    ...(showCertificate
      ? [{
          id: "menu-certificate",
          title: getPrompt("certificate_menu_label", lang, "My Certificate"),
          description: getPrompt("certificate_menu_description", lang, "View or resend your certificate")
        }]
      : [])
  ];
```

Update every call site of `buildMainMenuReply` to pass the flag. Find them with:

```bash
grep -n "buildMainMenuReply(" backend/src/whatsapp/handler.ts
```

- [ ] **Step 4: Write the failing test**

Add to `backend/src/whatsapp/handler.test.ts`:

```ts
test("the certificate row is hidden until it is earned", () => {
  const without = buildMainMenuReply("Ada", "en", false);
  const rows = without.list.sections[0]?.rows ?? [];
  assert.equal(rows.some((r) => r.id === "menu-certificate"), false);
});

test("the certificate row appears once earned", () => {
  const withCert = buildMainMenuReply("Ada", "en", true);
  const rows = withCert.list.sections[0]?.rows ?? [];
  assert.equal(rows.some((r) => r.id === "menu-certificate"), true);
});
```

- [ ] **Step 5: Run the test to verify it fails, then passes**

```bash
npx tsx --test src/whatsapp/handler.test.ts
```

Expected before Step 3 is applied: FAIL on the second test. After: PASS.

- [ ] **Step 6: Hook issuing into module_completed**

In the `module_completed` branch of `handler.ts` (around line 1983, after the milestone award loop), add:

```ts
          // Certificate eligibility rides on the same completion count the
          // milestone rewards use, so the two can never disagree about what
          // "finished everything" means.
          const template = getRuntimeCertificateTemplate();
          if (template?.enabled && isEligible({ completedModules, totalModules })) {
            const existing = await prisma.certificate.findUnique({
              where: { userId: session.userId }
            });
            if (!existing) {
              session.state = "awaiting_certificate_confirm";
              session.pendingCertificate = { completedModules, totalModules };
            }
          }
```

Add `pendingCertificate?: { completedModules: number; totalModules: number } | undefined` to the session type at line 57, and persist it alongside the other session fields.

- [ ] **Step 7: Handle the two new states**

Add these branches next to the existing `awaiting_name` handling (around line 1194):

```ts
  if (session.state === "awaiting_certificate_confirm") {
    const normalised = (text ?? "").trim().toLowerCase();
    const wantsChange =
      normalised.includes("change") || normalised === "2" || normalised === "no";
    if (wantsChange) {
      session.state = "awaiting_certificate_name";
      return {
        state: session.state,
        reply: getPrompt(
          "certificate_name_prompt",
          lang,
          "What name should appear on your certificate?"
        )
      };
    }
    await issueForSession(session, session.name ?? "", lang);
    session.state = "main_menu";
    return { state: session.state, ...buildMainMenuReply(session.name ?? "", lang, true) };
  }

  if (session.state === "awaiting_certificate_name") {
    const result = sanitiseLearnerName(text ?? "");
    if (!result.ok) {
      return {
        state: session.state,
        reply:
          result.reason === "too_long"
            ? getPrompt("certificate_name_too_long", lang, "That name is too long to fit the certificate.")
            : getPrompt("certificate_name_empty", lang, "Please type the name you want on your certificate.")
      };
    }
    await prisma.user.update({
      where: { id: session.userId },
      data: { name: result.value }
    });
    await issueForSession(session, result.value, lang);
    session.state = "main_menu";
    return { state: session.state, ...buildMainMenuReply(result.value, lang, true) };
  }
```

Add the helper near the other handler-local helpers:

```ts
/**
 * Issue and send. Swallows send failures deliberately: the row already
 * exists, so "My Certificate" and the admin Resend action are the recovery
 * paths — a failed send must not also fail the learner's menu reply.
 */
async function issueForSession(
  session: { userId: string; phone: string; pendingCertificate?: { completedModules: number; totalModules: number } | undefined },
  learnerName: string,
  lang: "en" | "pcm" | "ig"
): Promise<void> {
  const template = getRuntimeCertificateTemplate();
  const completion = session.pendingCertificate;
  if (!template || !completion) return;
  const plan = buildIssuePlan({
    template,
    templateVersion: getRuntimeCertificateTemplateVersion(),
    learnerName,
    completion
  });
  if (!plan) return;
  await issueCertificate({
    userId: session.userId,
    learnerPhone: session.phone,
    plan,
    baseUrl: process.env.PUBLIC_BASE_URL ?? "",
    caption: getPrompt("certificate_sent", lang, "Here is your certificate. Congratulations! 🎓")
  });
  session.pendingCertificate = undefined;
}
```

`getRuntimeCertificateTemplateVersion()` must be added to `runtime-config.ts` alongside the template getter, returning the published version number of the `certificate.template` document (the runtime cache already tracks version numbers for other documents — follow the same accessor pattern).

- [ ] **Step 8: Handle the menu tap**

In the `main_menu` branch, add a case for `menu-certificate` that looks up the row and re-sends the image, or resumes the confirm exchange when no row exists yet.

- [ ] **Step 9: Run the full whatsapp test file and typecheck**

```bash
npx tsx --test src/whatsapp/handler.test.ts && npm run typecheck
```

Expected: all pass; typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add backend/src/whatsapp/handler.ts backend/src/whatsapp/handler.test.ts backend/src/whatsapp/bot-prompts.ts backend/src/config-platform/runtime-config.ts
git commit -m "feat(certificates): confirm-name flow and earned-only menu row

Eligibility rides on the same completion count the milestone rewards use,
so the two can never disagree about what finishing everything means.

The menu row is hidden until earned: a permanent row reads as a promise to
someone on lesson 2, and tapping it would produce a locked door."
```

---

### Task 9: Seeds — placeholder artwork, template document, bot copy

**Files:**
- Create: `backend/assets/certificates/placeholder-background.png`
- Create: `backend/assets/certificates/placeholder-logo.png`
- Create: `backend/src/config-platform/seed-certificate-template.ts`
- Modify: `backend/package.json` (add the `seed:certificate-template` script)

- [ ] **Step 1: Generate the placeholder artwork**

Run from `backend/`:

```bash
node -e "
const sharp = require('sharp');
const bg = Buffer.from('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"2000\" height=\"1414\"><rect width=\"2000\" height=\"1414\" fill=\"#f5f2ec\"/><rect x=\"60\" y=\"60\" width=\"1880\" height=\"1294\" fill=\"none\" stroke=\"#c9bfa8\" stroke-width=\"6\"/><text x=\"1000\" y=\"180\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"64\" fill=\"#b03a2e\">PLACEHOLDER ARTWORK</text><text x=\"1000\" y=\"1300\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"40\" fill=\"#b03a2e\">Replace before enabling certificates</text></svg>');
sharp(bg).png().toFile('assets/certificates/placeholder-background.png').then(()=>console.log('background written'));
const logo = Buffer.from('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"160\"><rect width=\"400\" height=\"160\" fill=\"none\" stroke=\"#b03a2e\" stroke-width=\"4\"/><text x=\"200\" y=\"95\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"36\" fill=\"#b03a2e\">LOGO</text></svg>');
sharp(logo).png().toFile('assets/certificates/placeholder-logo.png').then(()=>console.log('logo written'));
"
```

Expected: `background written`, `logo written`. The artwork says PLACEHOLDER in red on purpose — if one ever escapes, it is unmistakable rather than subtly wrong.

- [ ] **Step 2: Write the seed script**

Create `backend/src/config-platform/seed-certificate-template.ts`:

```ts
/**
 * Seeds the certificate assets and publishes a baseline
 * `certificate.template` document.
 *
 * Ships `enabled: false` with PLACEHOLDER artwork. Swapping in the real
 * design is a re-run of this script plus a republish — no code change, no
 * deploy. Turning `enabled` on is a deliberate, separate act.
 *
 * Usage:
 *   POSTGRES_URL=... npm run seed:certificate-template -w @shetrades/backend
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "../admin/prisma.js";

async function upsertAsset(key: string, kind: string, path: string) {
  const bytes = await readFile(path);
  const meta = await sharp(bytes).metadata();
  const checksum = createHash("sha256").update(bytes).digest("hex");
  await prisma.certificateAsset.upsert({
    where: { key },
    update: { bytes, kind, mimeType: "image/png", width: meta.width ?? 0, height: meta.height ?? 0, checksum },
    create: {
      key, kind, mimeType: "image/png", bytes,
      width: meta.width ?? 0, height: meta.height ?? 0,
      checksum, uploadedBy: "seed"
    }
  });
  console.log(JSON.stringify({ event: "certificate.asset.seeded", key, checksum }));
}

async function main() {
  await upsertAsset("cert-bg-placeholder", "background", "assets/certificates/placeholder-background.png");
  await upsertAsset("logo-placeholder", "logo", "assets/certificates/placeholder-logo.png");
  console.log(
    "Assets seeded. Now create/publish the certificate.template document with this payload:\n" +
      JSON.stringify(
        {
          kind: "certificate_template",
          enabled: false,
          programmeName: "SheTrades Digital Skills Programme",
          issuerName: "TechHer",
          assetKey: "cert-bg-placeholder",
          canvas: { width: 2000, height: 1414 },
          fields: [
            { id: "learner-name", variable: "learnerName", x: 0.5, y: 0.52, maxWidth: 0.7, align: "center", font: "DejaVu Sans", size: 0.06, weight: 600, color: "#1a1a1a", autoShrink: true },
            { id: "programme", variable: "programmeName", x: 0.5, y: 0.62, maxWidth: 0.8, align: "center", font: "DejaVu Sans", size: 0.03, weight: 400, color: "#4a453e", autoShrink: true },
            { id: "issued", variable: "issuedDate", x: 0.5, y: 0.72, maxWidth: 0.5, align: "center", font: "DejaVu Sans", size: 0.022, weight: 400, color: "#6b6660", autoShrink: false },
            { id: "cert-id", variable: "certificateId", x: 0.5, y: 0.93, maxWidth: 0.6, align: "center", font: "DejaVu Sans", size: 0.014, weight: 400, color: "#8a857e", autoShrink: false },
            { id: "logo-main", variable: "logo", assetKey: "logo-placeholder", x: 0.5, y: 0.14, width: 0.14, align: "center", opacity: 1 },
            { id: "qr", variable: "qrCode", x: 0.86, y: 0.8, width: 0.08, align: "left", opacity: 1 }
          ]
        },
        null,
        2
      )
  );
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: "certificate.seed.error", message: String(error) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Register the npm script**

In `backend/package.json`, add to `scripts`:

```json
    "seed:certificate-template": "tsx src/config-platform/seed-certificate-template.ts",
```

- [ ] **Step 4: Run the seed against a local database and typecheck**

```bash
npm run typecheck
```

Expected: clean. (The seed itself runs against staging in Task 11.)

- [ ] **Step 5: Commit**

```bash
git add backend/assets/certificates backend/src/config-platform/seed-certificate-template.ts backend/package.json
git commit -m "feat(certificates): placeholder artwork and template seed

Artwork says PLACEHOLDER in red on purpose. If one ever escapes to a
learner it is unmistakable rather than subtly wrong - and enabled:false
plus a separate publish step is what keeps that from happening."
```

---

### Task 10: Admin routes, dashboard table and /users drawer link

**Files:**
- Create: `backend/src/certificates/routes-admin.ts`
- Test: `backend/src/certificates/routes-admin.test.ts`
- Modify: `backend/src/app.ts`, `backend/src/routes/admin.ts`
- Create: `dashboard/lib/admin/certificates.ts`
- Create: `dashboard/components/certificates/CertificatesTable.tsx`
- Modify: the `/users` detail drawer component

- [ ] **Step 1: Write the failing test**

Create `backend/src/certificates/routes-admin.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { certificatesAdminRouter } from "./routes-admin.js";

test("admin certificate routes reject unauthenticated callers", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", certificatesAdminRouter);
  const response = await request(app).get("/api/admin/certificates");
  assert.equal(response.status, 401);
});

test("revoke rejects an unauthenticated caller", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", certificatesAdminRouter);
  const response = await request(app)
    .post("/api/admin/certificates/abc/revoke")
    .send({ reason: "issued in error" });
  assert.equal(response.status, 401);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx tsx --test src/certificates/routes-admin.test.ts
```

Expected: FAIL — `Cannot find module './routes-admin.js'`.

- [ ] **Step 3: Implement the admin router**

Create `backend/src/certificates/routes-admin.ts` following the shape of `backend/src/routes/admin.ts`: import `authenticateJwt` and `requireWriteAccess` from the same modules that file uses, apply `authenticateJwt` to the router, and implement:

- `GET /certificates` — list with `search`, `status` (`issued` | `revoked`), pagination
- `GET /certificates/:id` — detail
- `PATCH /certificates/:id` — `{ learnerName }`, validated through `sanitiseLearnerName`, audit-logged
- `POST /certificates/:id/revoke` — `{ reason }`, sets `revokedAt`/`revokedReason`/`revokedBy`
- `POST /certificates/:id/unrevoke` — clears them
- `POST /certificates/:id/resend` — re-sends the image via `sendWhatsAppOutreach`
- `POST /certificates` — `{ userId, learnerName }` manual issue

Every mutation logs `{ event: "certificate.admin_action", action, certificateId, actorId, actorRole }` in the same shape as `payouts.admin_action`.

- [ ] **Step 4: Extend the learner detail payload**

In `backend/src/routes/admin.ts`, find the learner detail handler and include the certificate:

```ts
    const certificate = await prisma.certificate.findUnique({
      where: { userId: user.id },
      select: { publicId: true, issuedAt: true, revokedAt: true, learnerName: true }
    });
```

Add to the response body:

```ts
      ...(certificate ? { certificate } : {}),
```

- [ ] **Step 5: Mount the admin router**

In `backend/src/app.ts`, before the general `app.use("/api/admin", adminRouter)`:

```ts
  app.use("/api/admin", certificatesAdminRouter);
```

- [ ] **Step 6: Dashboard — API client**

Create `dashboard/lib/admin/certificates.ts` mirroring `dashboard/lib/admin/two-factor.ts`: typed `listCertificates`, `updateCertificateName`, `revokeCertificate`, `unrevokeCertificate`, `resendCertificate`, all through `fetchAdminAuthJson`.

- [ ] **Step 7: Dashboard — Certificates table**

Create `dashboard/components/certificates/CertificatesTable.tsx` using the existing shared UI components (`Card`, `Badge`, `Button`, `ConfirmationModal`) — no one-off markup, per the component-library rule. Columns: learner, printed name, issued date, status badge, verify link, actions.

- [ ] **Step 8: Dashboard — /users drawer link**

In the learner detail drawer, render a certificate row when `certificate` is present: status badge (Issued / Revoked), issue date, and an external link to the verify URL.

- [ ] **Step 9: Run backend tests, typecheck both workspaces, build the dashboard**

```bash
npx tsx --test src/certificates/*.test.ts && npm run typecheck
cd ../dashboard && npm run build
```

Expected: all tests pass, both typechecks clean, dashboard build succeeds.

- [ ] **Step 10: Commit**

```bash
git add backend/src/certificates/routes-admin.ts backend/src/certificates/routes-admin.test.ts backend/src/app.ts backend/src/routes/admin.ts dashboard/
git commit -m "feat(certificates): admin management and learner drawer link

Revocation is separate from name correction: a typo fix keeps the same
publicId because the learner has already shared that link."
```

---

### Task 11: Deploy, seed and verify on staging

**Files:**
- Modify: `handoff.md`, `task-list.md`

- [ ] **Step 1: Run the whole backend suite**

```bash
cd backend && npm run test:ci
```

Expected: all files pass.

- [ ] **Step 2: Deploy the backend**

Use the deploy command recorded in `docs/backend-ops-runbook.md`. Confirm the new revision serves traffic before continuing.

- [ ] **Step 3: Confirm `PUBLIC_BASE_URL` is set on the service**

```bash
gcloud run services describe shetrades-backend-staging --region us-central1 --format="value(spec.template.spec.containers[0].env)"
```

If absent, set it to the service's public URL. Without it the image link handed to Meta is relative and the send silently fails.

- [ ] **Step 4: Seed the assets**

With the Cloud SQL proxy running:

```bash
cloud-sql-proxy shetrades-staging-12345:us-central1:shetrades-pg-staging --port 5433
```

then from `backend/`:

```bash
POSTGRES_URL=<proxy url> npm run seed:certificate-template -w @shetrades/backend
```

Expected: two `certificate.asset.seeded` lines and the template payload printed.

- [ ] **Step 5: Publish the template document**

In the dashboard, create the `certificate.template` document with the printed payload and publish it. Leave `enabled: false` for now.

- [ ] **Step 6: End-to-end test**

Set `enabled: true`, then on the sandbox number complete every module. Confirm:

- the confirm-name prompt arrives with the stored name
- choosing "Change name" accepts a new name, and a 61-character name is politely rejected
- the certificate image arrives in the chat
- the verify link opens and shows name, programme, date and issuer
- the response body contains no phone number
- "My Certificate" now appears in the main menu and re-sends the image
- the `/users` drawer shows the certificate with a working verify link

- [ ] **Step 7: Turn it back off**

Set `enabled: false` and republish until the real artwork is signed off. Record this on the launch checklist.

- [ ] **Step 8: Update the tracking docs**

Append to `handoff.md` what shipped, the placeholder-artwork state, and the two operator actions outstanding (real artwork, then `enabled: true`). Mark the Phase 1 tasks complete in `task-list.md`.

- [ ] **Step 9: Commit and push**

```bash
git add handoff.md task-list.md
git commit -m "docs: certificates phase 1 shipped, awaiting real artwork"
git push origin main
```

---

## Self-review

**Spec coverage.** §4 data model → Task 1. §5 public contracts → Task 7; admin contracts → Task 10; learner detail → Task 10 Step 4. §6 bot flow and sanitisation → Tasks 2 and 8. §7 config documents → Tasks 3 and 9. §8 rendering → Tasks 4 and 5. §10 failure handling → Task 6 (row-before-send), Task 5 (missing asset throws), Task 6 (upsert idempotency). §11 security → Task 2 (public id), Task 4 (escaping), Task 7 (nosniff, identical 404s), Task 10 (auth). §12 testing → distributed through every task.

**Deferred to Phase 2, by design:** the asset upload endpoint and the canvas editor (spec §9), and public-route rate limiting — Phase 1 routes are read-only and cheap, and the throttle store is currently account-keyed rather than IP-keyed, so wiring it here would be a bigger change than it looks. Add it before the number is publicised.

**Known approximation.** `fitFontSize` estimates text width from an average glyph ratio rather than real font metrics. It is deliberately pessimistic, so text lands inside its box rather than a pixel outside. If a name still overflows in Task 11's end-to-end test, lower `AVG_GLYPH_RATIO` rather than reaching for a text-shaping library.
