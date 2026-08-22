# Lesson Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner tap **Listen** on a lesson and receive a voiceover of that
lesson in her own language.

**Architecture:** Recordings are uploaded in bulk through the dashboard and
matched to lessons by filename convention rather than picked from a dropdown.
Each upload is stored as bytes in Postgres, served back over a cached public
route, and its URL written into the lesson's existing `audioUrls` field as a
draft. At runtime the lesson message grows a third button only when audio exists
for that lesson and language; tapping it sends one audio message.

**Tech Stack:** Node 20 + Express 5 + Prisma 7 (Postgres via Cloud SQL), Next.js
16 dashboard, WhatsApp Cloud API, `node:test` for tests.

---

## Why this shape

Three constraints drove the design, and each one rules out an obvious
alternative. Read these before changing the approach.

**A WhatsApp audio message cannot carry a caption.** Image, video and document
can; audio and sticker cannot. So the word "Listen" cannot be attached to the
audio itself - it must live on a button or in the text that precedes it.

**Audio must not be pushed with every lesson.** A lesson currently costs one
message. Sending audio alongside it doubles every learner's traffic into Meta's
per-pair rate limit, which this programme has already hit in testing (error
`131056`, at roughly 10-15 messages per minute to one number). It also spends the
learner's data without asking, and this audience is on limited bundles. A button
makes it her choice and keeps the default cost unchanged.

**A dropdown of 129 files is a mis-assignment waiting to happen.** 43 lessons in
up to 3 languages means 129 manual selections, each able to attach the wrong
lesson or the wrong language, and the mistake is nearly undetectable without
listening to everything. Convention-based matching turns that into a handful of
exceptions.

## What already exists

Do not rebuild these:

- **`audioUrls` on every lesson** - `{ en?, pcm?, ig? }`, already validated,
  versioned, published, and carried into the runtime lesson object by
  `getRuntimeLessons` (`backend/src/config-platform/runtime-config.ts:352`).
- **A field in the lesson editor** - "🔊 Voiceover Audio Links (Optional)" in
  `dashboard/components/config/ConfigEditorDrawer.tsx:1014`, three URL inputs.
- **Nothing reads it.** `grep -i audio backend/src/whatsapp/` returns nothing.
  The value reaches the bot and is discarded.

The field stays a **URL**. Upload produces one; an organisation hosting audio
elsewhere can still paste an external link and it will work unchanged.

## Decision left open: where the bytes live

This plan stores audio **as bytes in Postgres**, mirroring `certificate_assets`,
whose own comment explains the choice: *"a handful of images does not justify a
GCS bucket, its IAM policy and a CORS config"* (`backend/src/admin/prisma.ts:197`).
There is no GCS bucket in this project today; adding one is new infrastructure.

**Switch to Google Cloud Storage if either is true when you start:**

- individual recordings exceed ~5 MB, or
- more than three languages are planned.

43 English lessons at 1-3 MB each is roughly 90 MB, which Postgres carries
comfortably. 129 files at 10 MB each is 1.3 GB, which it should not. Measure one
real recording before committing. If you switch, only Task 2 and Task 3 change;
the naming, matching, delivery and UI tasks are unaffected because they only ever
handle a URL.

## File structure

**Create:**

| File | Responsibility |
| --- | --- |
| `backend/src/lessons/audio-naming.ts` | Pure. Filename <-> (lesson key, language). |
| `backend/src/lessons/audio-naming.test.ts` | Tests for the above. |
| `backend/src/lessons/audio-upload.ts` | Pure. Validates one upload: type, size, key shape. |
| `backend/src/lessons/audio-upload.test.ts` | Tests for the above. |
| `backend/src/lessons/routes-audio.ts` | Admin upload/list + public streaming route. |
| `backend/src/lessons/routes-audio.test.ts` | Route tests. |
| `backend/prisma/migrations/20260901000000_lesson_audio/migration.sql` | The table. |
| `dashboard/components/content/LessonAudioUploader.tsx` | Bulk upload + match report. |

**Modify:**

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `LessonAudioAsset` model. |
| `backend/src/admin/prisma.ts` | Bootstrap mirror of the table. |
| `backend/src/app.ts` | Mount both routers. |
| `backend/src/whatsapp/sender.ts` | An `audio` message type. |
| `backend/src/whatsapp/handler.ts` | Listen button on lesson replies; handle the tap. |
| `backend/src/whatsapp/bot-prompts.ts` | Listen label + "no audio" fallback copy. |
| `backend/src/privacy/erasure.ts` | Nothing. Audio holds no learner data - noted so the next reader does not have to check. |

---

## Task 1: Filename convention

**Files:**
- Create: `backend/src/lessons/audio-naming.ts`
- Test: `backend/src/lessons/audio-naming.test.ts`

Lesson keys are `content.lesson.m1_l2_m`. Recordings are named for the short
slug plus the language: `m1_l2_m.en.m4a`.

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseAudioFilename, assetKeyFor, LESSON_KEY_PREFIX } from "./audio-naming.js";

test("a well-formed filename resolves to a lesson key and language", () => {
  assert.deepEqual(parseAudioFilename("m1_l2_m.en.m4a"), {
    ok: true,
    lessonKey: "content.lesson.m1_l2_m",
    language: "en",
    extension: "m4a"
  });
});

test("case and surrounding whitespace do not matter", () => {
  const parsed = parseAudioFilename("  M1_L2_M.EN.M4A  ");
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.lessonKey, "content.lesson.m1_l2_m");
    assert.equal(parsed.language, "en");
  }
});

test("an unsupported language is rejected rather than guessed", () => {
  // A typo here would silently deliver the wrong language to a learner.
  const parsed = parseAudioFilename("m1_l2_m.fr.m4a");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.reason, /language/i);
});

test("a filename missing the language segment is rejected", () => {
  assert.equal(parseAudioFilename("m1_l2_m.m4a").ok, false);
});

test("an unsupported extension is rejected", () => {
  assert.equal(parseAudioFilename("m1_l2_m.en.wav").ok, false);
});

test("the asset key is stable and unique per lesson and language", () => {
  assert.equal(assetKeyFor("content.lesson.m1_l2_m", "en"), "m1_l2_m.en");
  assert.notEqual(
    assetKeyFor("content.lesson.m1_l2_m", "en"),
    assetKeyFor("content.lesson.m1_l2_m", "pcm")
  );
});

test("the lesson key prefix matches what published content actually uses", () => {
  assert.equal(LESSON_KEY_PREFIX, "content.lesson.");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lessons/audio-naming.test.ts` from `backend/`
Expected: FAIL, `Cannot find module './audio-naming.js'`

- [ ] **Step 3: Implement**

```ts
/**
 * Filenames are the matching key between a batch of recordings and the lessons
 * they belong to. A dropdown would mean 129 manual selections across 43 lessons
 * and 3 languages, each able to attach the wrong lesson or wrong language - and
 * a mis-assignment is undetectable without listening to every file.
 *
 * Convention: <lesson-slug>.<language>.<ext>, e.g. "m1_l2_m.en.m4a".
 */

/** Published lesson documents are keyed `content.lesson.<slug>`. */
export const LESSON_KEY_PREFIX = "content.lesson.";

/** Languages the bot can select. Must match `languages` on a lesson payload. */
export const AUDIO_LANGUAGES = ["en", "pcm", "ig"] as const;
export type AudioLanguage = (typeof AUDIO_LANGUAGES)[number];

/**
 * Formats WhatsApp will play inline. Deliberately narrow: `wav` and `flac` are
 * rejected by Meta, and a learner would get a silent failure rather than an
 * error, so they are refused here where somebody is watching.
 */
export const AUDIO_EXTENSIONS = ["m4a", "mp3", "ogg", "aac", "amr"] as const;

export type ParsedAudioFilename =
  | { ok: true; lessonKey: string; language: AudioLanguage; extension: string }
  | { ok: false; reason: string };

/** `content.lesson.m1_l2_m` + `en` -> `m1_l2_m.en`. Stable, one per pair. */
export function assetKeyFor(lessonKey: string, language: string): string {
  const slug = lessonKey.startsWith(LESSON_KEY_PREFIX)
    ? lessonKey.slice(LESSON_KEY_PREFIX.length)
    : lessonKey;
  return `${slug}.${language}`.toLowerCase();
}

export function parseAudioFilename(filename: string): ParsedAudioFilename {
  const cleaned = filename.trim().toLowerCase();
  const parts = cleaned.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      reason: `Expected <lesson>.<language>.<extension>, for example m1_l2_m.en.m4a`
    };
  }
  const [slug, language, extension] = parts as [string, string, string];
  if (!/^[a-z0-9_]+$/.test(slug)) {
    return { ok: false, reason: `"${slug}" is not a lesson name` };
  }
  if (!(AUDIO_LANGUAGES as readonly string[]).includes(language)) {
    return {
      ok: false,
      reason: `"${language}" is not a supported language (${AUDIO_LANGUAGES.join(", ")})`
    };
  }
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      reason: `"${extension}" is not a format WhatsApp plays (${AUDIO_EXTENSIONS.join(", ")})`
    };
  }
  return {
    ok: true,
    lessonKey: `${LESSON_KEY_PREFIX}${slug}`,
    language: language as AudioLanguage,
    extension
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx tsx --test src/lessons/audio-naming.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/lessons/audio-naming.ts backend/src/lessons/audio-naming.test.ts
git commit -m "feat(lessons): filename convention for matching audio to lessons"
```

---

## Task 2: Upload validation

**Files:**
- Create: `backend/src/lessons/audio-upload.ts`
- Test: `backend/src/lessons/audio-upload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { validateAudioUpload, MAX_AUDIO_BYTES, ALLOWED_AUDIO_MIME } from "./audio-upload.js";

test("a normal recording is accepted", () => {
  const result = validateAudioUpload({
    filename: "m1_l2_m.en.m4a",
    declaredMime: "audio/mp4",
    byteLength: 2 * 1024 * 1024,
    existingKeys: []
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assetKey, "m1_l2_m.en");
});

test("a file over the size ceiling is refused", () => {
  // Meta caps audio at 16 MB and rejects the send outright, which would look
  // to a learner like the button simply not working.
  const result = validateAudioUpload({
    filename: "m1_l2_m.en.m4a",
    declaredMime: "audio/mp4",
    byteLength: MAX_AUDIO_BYTES + 1,
    existingKeys: []
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /too large|16/i);
});

test("an empty file is refused", () => {
  const result = validateAudioUpload({
    filename: "m1_l2_m.en.m4a",
    declaredMime: "audio/mp4",
    byteLength: 0,
    existingKeys: []
  });
  assert.equal(result.ok, false);
});

test("a mime type outside the allowlist is refused", () => {
  const result = validateAudioUpload({
    filename: "m1_l2_m.en.m4a",
    declaredMime: "application/zip",
    byteLength: 1000,
    existingKeys: []
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /format|type/i);
});

test("a bad filename fails with the naming error, not a generic one", () => {
  const result = validateAudioUpload({
    filename: "lesson-one.mp3",
    declaredMime: "audio/mpeg",
    byteLength: 1000,
    existingKeys: []
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /m1_l2_m\.en\.m4a/);
});

test("re-uploading the same lesson and language REPLACES rather than refusing", () => {
  // Unlike certificate artwork, which is frozen into issued credentials and so
  // must never be overwritten, a re-recorded lesson SHOULD replace the old one:
  // nothing downstream has a frozen copy, and refusing would force operators to
  // invent m1_l2_m_v2 filenames that then stop matching the lesson.
  const result = validateAudioUpload({
    filename: "m1_l2_m.en.m4a",
    declaredMime: "audio/mp4",
    byteLength: 1000,
    existingKeys: ["m1_l2_m.en"]
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.replacesExisting, true);
});

test("the allowlist covers every extension the naming module permits", () => {
  assert.ok(Object.keys(ALLOWED_AUDIO_MIME).length >= 4);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lessons/audio-upload.test.ts`
Expected: FAIL, `Cannot find module './audio-upload.js'`

- [ ] **Step 3: Implement**

```ts
import { parseAudioFilename, assetKeyFor } from "./audio-naming.js";

/**
 * Meta caps audio at 16 MB and REJECTS the send rather than truncating, so an
 * oversized file would look to a learner like the Listen button doing nothing.
 * Refuse it at upload, where somebody is watching the screen.
 */
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

/** Declared types accepted, mapped to the extension they must agree with. */
export const ALLOWED_AUDIO_MIME: Record<string, readonly string[]> = {
  "audio/mp4": ["m4a"],
  "audio/m4a": ["m4a"],
  "audio/mpeg": ["mp3"],
  "audio/ogg": ["ogg"],
  "audio/aac": ["aac"],
  "audio/amr": ["amr"]
};

export type AudioUploadFacts = {
  filename: string;
  declaredMime: string;
  byteLength: number;
  /** Asset keys already stored, so a re-record can be reported as a replacement. */
  existingKeys: readonly string[];
};

export type AudioUploadResult =
  | {
      ok: true;
      assetKey: string;
      lessonKey: string;
      language: string;
      mimeType: string;
      replacesExisting: boolean;
    }
  | { ok: false; reason: string };

export function validateAudioUpload(facts: AudioUploadFacts): AudioUploadResult {
  const parsed = parseAudioFilename(facts.filename);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }

  const mime = facts.declaredMime.split(";")[0]!.trim().toLowerCase();
  const extensionsForMime = ALLOWED_AUDIO_MIME[mime];
  if (!extensionsForMime) {
    return {
      ok: false,
      reason: `"${facts.declaredMime}" is not an audio format WhatsApp plays`
    };
  }
  if (!extensionsForMime.includes(parsed.extension)) {
    return {
      ok: false,
      reason: `The file is named .${parsed.extension} but its type says ${mime}`
    };
  }

  if (facts.byteLength <= 0) {
    return { ok: false, reason: "The file is empty" };
  }
  if (facts.byteLength > MAX_AUDIO_BYTES) {
    const mb = (facts.byteLength / 1024 / 1024).toFixed(1);
    return { ok: false, reason: `${mb} MB is too large. WhatsApp's limit is 16 MB` };
  }

  const assetKey = assetKeyFor(parsed.lessonKey, parsed.language);
  return {
    ok: true,
    assetKey,
    lessonKey: parsed.lessonKey,
    language: parsed.language,
    mimeType: mime,
    replacesExisting: facts.existingKeys.includes(assetKey)
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx tsx --test src/lessons/audio-upload.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/lessons/audio-upload.ts backend/src/lessons/audio-upload.test.ts
git commit -m "feat(lessons): validate audio uploads against WhatsApp's limits"
```

---

## Task 3: The table

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901000000_lesson_audio/migration.sql`
- Modify: `backend/src/admin/prisma.ts` (beside the `certificate_assets` block, around line 197)

- [ ] **Step 1: Add the model**

Append to `backend/prisma/schema.prisma`:

```prisma
/// A lesson voiceover. Bytes in Postgres rather than object storage, matching
/// certificate_assets and for the same reason: a few dozen files do not justify
/// a GCS bucket, its IAM policy and a CORS config. Revisit above ~5 MB per file
/// or beyond three languages.
///
/// Holds NO learner data, so it is deliberately absent from ERASURE_ORDER.
model LessonAudioAsset {
  id         String   @id @default(uuid())
  /// `<lesson-slug>.<language>`, e.g. "m1_l2_m.en". One per pair.
  key        String   @unique
  lessonKey  String
  language   String
  mimeType   String
  bytes      Bytes
  byteSize   Int
  checksum   String
  uploadedBy String
  uploadedAt DateTime @default(now())

  @@index([lessonKey])
  @@map("lesson_audio_assets")
}
```

- [ ] **Step 2: Write the migration**

Create `backend/prisma/migrations/20260901000000_lesson_audio/migration.sql`.
Every identifier is quoted: Postgres folds unquoted names to lower case and
Prisma then cannot find the camelCase columns it expects.

```sql
-- Lesson voiceovers. Bytes in Postgres, mirroring certificate_assets.
CREATE TABLE IF NOT EXISTS "lesson_audio_assets" (
  "id"         TEXT NOT NULL,
  "key"        TEXT NOT NULL,
  "lessonKey"  TEXT NOT NULL,
  "language"   TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL,
  "bytes"      BYTEA NOT NULL,
  "byteSize"   INTEGER NOT NULL,
  "checksum"   TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lesson_audio_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_audio_assets_key_key"
  ON "lesson_audio_assets" ("key");
CREATE INDEX IF NOT EXISTS "lesson_audio_assets_lessonKey_idx"
  ON "lesson_audio_assets" ("lessonKey");
```

- [ ] **Step 3: Mirror it in the bootstrap**

In `backend/src/admin/prisma.ts`, immediately after the `certificate_assets`
block, add. This is what actually creates the table on a fresh environment - the
migration alone is not enough here, because the service self-provisions at boot.

```ts
    // lesson_audio_assets — lesson voiceovers as bytes, same rationale as
    // certificate_assets above. Keep in sync with schema.prisma.
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS lesson_audio_assets (id TEXT PRIMARY KEY);`
    );
    for (const [column, type] of [
      ["key", "TEXT"],
      ["lessonKey", "TEXT"],
      ["language", "TEXT"],
      ["mimeType", "TEXT"],
      ["bytes", "BYTEA"],
      ["byteSize", "INTEGER"],
      ["checksum", "TEXT"],
      ["uploadedBy", "TEXT"],
      ["uploadedAt", "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP"]
    ] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE lesson_audio_assets ADD COLUMN IF NOT EXISTS "${column}" ${type};`
      );
    }
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "lesson_audio_assets_key_key" ON lesson_audio_assets ("key");`
    );
```

- [ ] **Step 4: Generate the client and typecheck**

```bash
cd backend && npx prisma generate && npx tsc -p tsconfig.json --noEmit
```
Expected: no output, exit 0

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/admin/prisma.ts
git commit -m "feat(lessons): lesson_audio_assets table"
```

---

## Task 4: Upload and serve

**Files:**
- Create: `backend/src/lessons/routes-audio.ts`
- Create: `backend/src/lessons/routes-audio.test.ts`
- Modify: `backend/src/app.ts`

Two routers, because they have different audiences. The admin one requires a
session; the public one is fetched by **Meta**, unauthenticated, when it delivers
the audio.

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createLessonAudioPublicRouter } from "./routes-audio.js";

function appWith(asset: { key: string; mimeType: string; bytes: Buffer } | null) {
  const app = express();
  app.use("/", createLessonAudioPublicRouter({ findByKey: async () => asset }));
  return app;
}

test("a known key streams the bytes with its stored type", async () => {
  const app = appWith({ key: "m1_l2_m.en", mimeType: "audio/mp4", bytes: Buffer.from("abc") });
  const response = await request(app).get("/a/m1_l2_m.en");
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "audio/mp4");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("the response is cacheable, because Meta refetches it per learner", async () => {
  const app = appWith({ key: "m1_l2_m.en", mimeType: "audio/mp4", bytes: Buffer.from("abc") });
  const response = await request(app).get("/a/m1_l2_m.en");
  assert.match(response.headers["cache-control"], /max-age=\d{4,}/);
});

test("an unknown key is 404, not a redirect or an empty 200", async () => {
  const response = await request(appWith(null)).get("/a/nope.en");
  assert.equal(response.status, 404);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lessons/routes-audio.test.ts`
Expected: FAIL, `Cannot find module './routes-audio.js'`

- [ ] **Step 3: Implement**

```ts
import { createHash } from "node:crypto";
import express, { Router } from "express";
import { prisma } from "../admin/prisma.js";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { MAX_AUDIO_BYTES, validateAudioUpload } from "./audio-upload.js";

export type PublicAudioDeps = {
  findByKey: (key: string) => Promise<{ key: string; mimeType: string; bytes: Buffer } | null>;
};

/**
 * Fetched by META, not by a browser, when it delivers the audio to a learner.
 * It is therefore unauthenticated by necessity, and the key is the only secret -
 * which is fine, because the content is a public lesson, not learner data.
 */
export function createLessonAudioPublicRouter(deps: PublicAudioDeps): Router {
  const router = Router();
  router.get("/a/:key", async (req, res) => {
    const asset = await deps.findByKey(String(req.params.key));
    if (!asset) {
      res.status(404).type("text/plain").send("Not Found");
      return;
    }
    res.setHeader("content-type", asset.mimeType);
    res.setHeader("x-content-type-options", "nosniff");
    // A day. Meta refetches per recipient, and a lesson recording does not
    // change without a new upload, which changes nothing about this URL - so
    // re-record means re-upload under the same key and a cache that lags a day.
    res.setHeader("cache-control", "public, max-age=86400");
    res.status(200).send(asset.bytes);
  });
  return router;
}

export const lessonAudioPublicRouter = createLessonAudioPublicRouter({
  findByKey: async (key) => {
    const row = await prisma.lessonAudioAsset.findUnique({
      where: { key },
      select: { key: true, mimeType: true, bytes: true }
    });
    return row ? { key: row.key, mimeType: row.mimeType, bytes: Buffer.from(row.bytes) } : null;
  }
});

/** Admin surface: list what is stored, and upload one file. */
export const lessonAudioAdminRouter = Router();
lessonAudioAdminRouter.use(authenticateJwt);

lessonAudioAdminRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.lessonAudioAsset.findMany({
      select: {
        key: true, lessonKey: true, language: true,
        mimeType: true, byteSize: true, uploadedAt: true, uploadedBy: true
      },
      orderBy: { key: "asc" }
    });
    res.status(200).json({ assets: rows });
  } catch (error) {
    next(error);
  }
});

lessonAudioAdminRouter.post(
  "/:filename",
  requireRoles(["editor", "admin"]),
  express.raw({ type: () => true, limit: MAX_AUDIO_BYTES + 1024 * 1024 }),
  async (req, res, next) => {
    try {
      const filename = String(req.params.filename);
      const raw = req.body as Buffer;
      const existing = await prisma.lessonAudioAsset.findMany({ select: { key: true } });

      const verdict = validateAudioUpload({
        filename,
        declaredMime: req.header("content-type") ?? "",
        byteLength: raw?.length ?? 0,
        existingKeys: existing.map((row) => row.key)
      });
      if (!verdict.ok) {
        res.status(400).json({ message: verdict.reason, filename });
        return;
      }

      const bytes = Buffer.from(raw);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const data = {
        key: verdict.assetKey,
        lessonKey: verdict.lessonKey,
        language: verdict.language,
        mimeType: verdict.mimeType,
        bytes,
        byteSize: bytes.length,
        checksum,
        uploadedBy: req.authUser?.id ?? "unknown"
      };
      await prisma.lessonAudioAsset.upsert({
        where: { key: verdict.assetKey },
        create: data,
        update: data
      });

      res.status(verdict.replacesExisting ? 200 : 201).json({
        key: verdict.assetKey,
        lessonKey: verdict.lessonKey,
        language: verdict.language,
        byteSize: bytes.length,
        replaced: verdict.replacesExisting
      });
    } catch (error) {
      next(error);
    }
  }
);
```

- [ ] **Step 4: Mount both routers**

In `backend/src/app.ts`, beside the existing certificate routers:

```ts
import { lessonAudioAdminRouter, lessonAudioPublicRouter } from "./lessons/routes-audio.js";

// ...inside createApp(), with the other app.use calls:
app.use("/api/admin/lesson-audio", lessonAudioAdminRouter);
app.use("/", lessonAudioPublicRouter);
```

- [ ] **Step 5: Run the tests**

Run: `npx tsx --test src/lessons/routes-audio.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/lessons/routes-audio.ts backend/src/lessons/routes-audio.test.ts backend/src/app.ts
git commit -m "feat(lessons): upload lesson audio and serve it for Meta to fetch"
```

---

## Task 5: Send audio over WhatsApp

**Files:**
- Modify: `backend/src/whatsapp/sender.ts`

The sender can currently build five message types: `text`, interactive list,
interactive button, `template`, `image`. There is no `audio` branch, which is
why `audioUrls` has never reached anybody.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/whatsapp/sender.test.ts`. `buildMessage` is not exported;
the existing tests drive `sendWhatsAppMessage` with a stubbed fetch and inspect
the request body, so match that style exactly - `publishConfig`, `stubFetch` and
`cfg` are already defined at the top of that file.

```ts
test("sends an audio message with a link", async () => {
  publishConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", {
    text: "",
    audio: { link: "https://www.shetrades.digital/a/m1_l2_m.en" }
  });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "audio");
  assert.equal(sent.audio.link, "https://www.shetrades.digital/a/m1_l2_m.en");
  publishConfig(null);
});

test("audio wins over text, because WhatsApp allows no caption on audio", async () => {
  // Image and video take a caption; audio and sticker do not. Anything put in
  // `text` alongside audio would be silently dropped by Meta, so the builder
  // must never produce a message that implies otherwise.
  publishConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", {
    text: "Listen to this lesson",
    audio: { link: "https://example.test/a.m4a" }
  });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "audio");
  assert.equal("text" in sent, false);
  publishConfig(null);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/whatsapp/sender.test.ts`
Expected: FAIL, `audio` is not a property of `OutboundReply`

- [ ] **Step 3: Implement**

In `backend/src/whatsapp/sender.ts`, add to the `OutboundReply` type:

```ts
  /**
   * A voiceover to send INSTEAD of text. WhatsApp permits no caption on an
   * audio message, so this is deliberately exclusive: any accompanying words
   * have to be their own message, or live on the button that requested it.
   */
  audio?: { link: string };
```

and add this as the FIRST branch of `buildMessage`, before the `reply.list` check:

```ts
  if (reply.audio) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: { link: reply.audio.link }
    };
  }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx tsx --test src/whatsapp/sender.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/whatsapp/sender.ts backend/src/whatsapp/sender.test.ts
git commit -m "feat(whatsapp): send audio messages"
```

---

## Task 6: The Listen button

**Files:**
- Modify: `backend/src/whatsapp/bot-prompts.ts`
- Modify: `backend/src/whatsapp/handler.ts` (two lesson delivery sites: around
  lines 2341-2348 and 2585-2598, both currently returning `buttons: ["QUIZ", "MENU"]`)

A lesson message carries two buttons and WhatsApp allows three, so there is
exactly one free slot.

- [ ] **Step 1: Add the copy**

In `backend/src/whatsapp/bot-prompts.ts`, add to `BOT_PROMPT_DEFAULTS`:

```ts
  listen_button: {
    // Reply-button title: 20 UTF-16 units max (WHATSAPP_LIMITS.buttonTitle).
    en: "🎧 Listen"
  },
  audio_unavailable: {
    en: "The audio for this lesson is not ready yet. The written lesson above has everything in it."
  },
```

and to `BOT_PROMPT_TITLES`:

```ts
  listen_button: "Bot · Listen button on a lesson",
  audio_unavailable: "Bot · Audio not available for this lesson",
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/whatsapp/lesson-audio.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { lessonButtonsFor, audioLinkFor } from "./lesson-audio.js";

test("a lesson with no audio keeps exactly the buttons it has today", () => {
  assert.deepEqual(lessonButtonsFor({}, "en", "🎧 Listen"), ["QUIZ", "MENU"]);
});

test("a lesson with audio in her language gains a third button", () => {
  const buttons = lessonButtonsFor({ en: "https://x.test/a.m4a" }, "en", "🎧 Listen");
  assert.deepEqual(buttons, ["QUIZ", "MENU", "🎧 Listen"]);
  assert.ok(buttons.length <= 3, "WhatsApp allows at most three buttons");
});

test("audio in another language does NOT offer her a button", () => {
  // Offering Listen and then playing English to an Igbo speaker is worse than
  // not offering it at all.
  assert.deepEqual(lessonButtonsFor({ en: "https://x.test/a.m4a" }, "ig", "🎧 Listen"), [
    "QUIZ",
    "MENU"
  ]);
});

test("the link resolves for her language only, with no English fallback", () => {
  assert.equal(audioLinkFor({ en: "https://x.test/a.m4a" }, "ig"), null);
  assert.equal(audioLinkFor({ ig: "https://x.test/i.m4a" }, "ig"), "https://x.test/i.m4a");
});

test("a blank or whitespace url counts as no audio", () => {
  assert.equal(audioLinkFor({ en: "   " }, "en"), null);
  assert.deepEqual(lessonButtonsFor({ en: "" }, "en", "🎧 Listen"), ["QUIZ", "MENU"]);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx tsx --test src/whatsapp/lesson-audio.test.ts`
Expected: FAIL, `Cannot find module './lesson-audio.js'`

- [ ] **Step 4: Implement the helper**

Create `backend/src/whatsapp/lesson-audio.ts`:

```ts
/**
 * Whether a lesson offers a voiceover, and where it lives.
 *
 * Pure so the button budget is testable: a lesson message already carries
 * QUIZ and MENU, and WhatsApp permits three buttons, so Listen occupies the
 * one remaining slot and nothing else may claim it.
 */

/** No fallback to English on purpose - see the test. */
export function audioLinkFor(
  audioUrls: Record<string, string> | null | undefined,
  language: string
): string | null {
  const raw = (audioUrls ?? {})[language];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export function lessonButtonsFor(
  audioUrls: Record<string, string> | null | undefined,
  language: string,
  listenLabel: string
): string[] {
  const base = ["QUIZ", "MENU"];
  return audioLinkFor(audioUrls, language) ? [...base, listenLabel] : base;
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx tsx --test src/whatsapp/lesson-audio.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Wire it into both lesson replies**

In `backend/src/whatsapp/handler.ts`, add the import beside the other whatsapp
imports:

```ts
import { audioLinkFor, lessonButtonsFor } from "./lesson-audio.js";
```

At the first site (around line 2341, the branch ending
`return { state: session.state, reply, buttons: ["QUIZ", "MENU"] };`), replace
that return with:

```ts
      return {
        state: session.state,
        reply,
        buttons: lessonButtonsFor(
          chosen.audioUrls,
          lang,
          getPrompt("listen_button", lang, "🎧 Listen")
        )
      };
```

At the second site (around line 2585, inside the `["next", "continue"]` branch),
replace its return with:

```ts
      return {
        state: session.state,
        reply,
        buttons: lessonButtonsFor(
          activeLesson.audioUrls,
          lang,
          getPrompt("listen_button", lang, "🎧 Listen")
        )
      };
```

- [ ] **Step 7: Handle the tap**

Button taps arrive as the button's TITLE text, so the matcher must compare
against the published label, not a hard-coded string. Add this inside the
`module_menu` branch, immediately before the `["next", "continue"]` check:

```ts
    const listenLabel = getPrompt("listen_button", lang, "🎧 Listen").trim().toLowerCase();
    if (normalized === listenLabel || normalized === "listen") {
      const link = audioLinkFor(activeLesson.audioUrls, lang);
      if (!link) {
        return {
          state: session.state,
          reply: getPrompt(
            "audio_unavailable",
            lang,
            "The audio for this lesson is not ready yet. The written lesson above has everything in it."
          ),
          buttons: ["QUIZ", "MENU"]
        };
      }
      session.lastUpdatedAt = nowIso();
      // Audio ONLY: WhatsApp permits no caption on an audio message, and a
      // second text message would double this learner's traffic into the
      // per-pair rate limit for no added meaning.
      return { state: session.state, reply: "", audio: { link } };
    }
```

- [ ] **Step 8: Let an audio-only reply through the webhook**

In `backend/src/whatsapp/handler.ts`, the send at the end of
`handleWhatsAppWebhook` currently always passes `text`. Change it to:

```ts
  if (opts.deliver) {
    await sendWhatsAppMessage(inbound.from, {
      text: result.reply,
      ...(result.audio ? { audio: result.audio } : {}),
      ...(result.buttons ? { buttons: result.buttons } : {}),
      ...(result.list ? { list: result.list } : {})
    });
  }
```

and add `audio?: { link: string }` to the transition result type beside
`buttons` and `list`.

- [ ] **Step 9: Run the whole suite**

Run: `npm test -w @shetrades/backend`
Expected: all pass. The menu row-count tests are the ones most likely to notice
a third button; if one fails, confirm it is asserting the OLD two-button shape
before changing it.

- [ ] **Step 10: Commit**

```bash
git add backend/src/whatsapp/
git commit -m "feat(whatsapp): offer a Listen button when a lesson has audio"
```

---

## Task 7: Bulk upload and the match report

**Files:**
- Create: `dashboard/components/content/LessonAudioUploader.tsx`
- Modify: `dashboard/app/(admin)/content/page.tsx`

The point of this screen is that nobody picks 129 files from a dropdown. They
drop a folder in, and the screen reports what matched.

- [ ] **Step 1: Build the component**

```tsx
"use client";

import { useState } from "react";
import { getStoredAdminAuthToken, ADMIN_API_BASE_URL } from "../../lib/admin-auth";
import { Button, Card, EmptyState } from "../ui";

type UploadOutcome =
  | { filename: string; ok: true; lessonKey: string; language: string; replaced: boolean }
  | { filename: string; ok: false; reason: string };

/**
 * Bulk upload for lesson voiceovers. Files are matched to lessons by FILENAME
 * (m1_l2_m.en.m4a), never by a dropdown: 43 lessons across 3 languages is 129
 * selections, and a mis-assignment plays the wrong lesson to a learner with
 * nothing to catch it.
 */
export function LessonAudioUploader() {
  const [outcomes, setOutcomes] = useState<UploadOutcome[]>([]);
  const [busy, setBusy] = useState(false);

  async function uploadAll(files: FileList) {
    setBusy(true);
    const results: UploadOutcome[] = [];
    for (const file of Array.from(files)) {
      try {
        const response = await fetch(
          `${ADMIN_API_BASE_URL}/api/admin/lesson-audio/${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${getStoredAdminAuthToken()}`,
              "content-type": file.type || "application/octet-stream"
            },
            body: file
          }
        );
        const payload = await response.json();
        results.push(
          response.ok
            ? {
                filename: file.name,
                ok: true,
                lessonKey: payload.lessonKey,
                language: payload.language,
                replaced: Boolean(payload.replaced)
              }
            : { filename: file.name, ok: false, reason: payload.message ?? "Upload failed" }
        );
      } catch {
        results.push({ filename: file.name, ok: false, reason: "Upload failed" });
      }
      setOutcomes([...results]);
    }
    setBusy(false);
  }

  const matched = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.filter((o) => !o.ok);

  return (
    <Card
      title="Lesson audio"
      description="Name each recording for its lesson and language, for example m1_l2_m.en.m4a, then upload them all at once."
    >
      <input
        type="file"
        multiple
        accept="audio/*"
        disabled={busy}
        onChange={(event) => {
          if (event.target.files?.length) void uploadAll(event.target.files);
        }}
      />

      {outcomes.length === 0 ? (
        <EmptyState
          title="No recordings uploaded yet"
          description="Files are matched to lessons by their name, so nothing needs selecting by hand."
        />
      ) : (
        <>
          <p>
            <strong>{matched}</strong> matched
            {failed.length > 0 ? (
              <>
                {" · "}
                <strong>{failed.length}</strong> could not be placed
              </>
            ) : null}
          </p>
          {failed.length > 0 ? (
            <ul>
              {failed.map((item) => (
                <li key={item.filename}>
                  <strong>{item.filename}</strong>: {"reason" in item ? item.reason : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <p>
        Uploading stores the recording. It does not put it in front of learners:
        open the lesson under Content, check the audio link, and publish.
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Add it to the Content page**

In `dashboard/app/(admin)/content/page.tsx`, import and render it beneath
`ContentTranslationQueuePanel`:

```tsx
import { LessonAudioUploader } from "../../../components/content/LessonAudioUploader";

// ...in the returned JSX, after <ContentTranslationQueuePanel />:
<LessonAudioUploader />
```

- [ ] **Step 3: Typecheck, lint and build**

```bash
cd dashboard && npm run typecheck && npm run lint && npm run build
```
Expected: typecheck exit 0, lint 0 errors, build succeeds

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/content/LessonAudioUploader.tsx "dashboard/app/(admin)/content/page.tsx"
git commit -m "feat(content): bulk upload lesson audio with a match report"
```

---

## Task 8: Write the URL into the lesson

**Files:**
- Modify: `backend/src/lessons/routes-audio.ts`

Uploading stores bytes. Something still has to put the resulting URL into the
lesson's `audioUrls` so the bot can find it. This happens as a **draft**, so a
publish is still required before any learner sees it.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/lessons/routes-audio.test.ts`:

```ts
import { audioPublicUrl } from "./routes-audio.js";

test("the public url is built from PUBLIC_BASE_URL, with no trailing slash", () => {
  assert.equal(
    audioPublicUrl("https://www.shetrades.digital/", "m1_l2_m.en"),
    "https://www.shetrades.digital/a/m1_l2_m.en"
  );
});

test("an unset base throws rather than emitting a relative link", () => {
  // Meta fetches this URL. A relative one is not fetchable, and the failure
  // would surface as a learner tapping Listen and getting nothing.
  assert.throws(() => audioPublicUrl("", "m1_l2_m.en"), /base url/i);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lessons/routes-audio.test.ts`
Expected: FAIL, `audioPublicUrl` is not exported

- [ ] **Step 3: Implement**

Add to `backend/src/lessons/routes-audio.ts`:

```ts
/**
 * Meta fetches this URL when delivering the audio, so it cannot be relative and
 * it cannot be the Cloud Run hostname if certificates have moved to the public
 * domain - both links should read the same to a learner who looks.
 */
export function audioPublicUrl(baseUrl: string, assetKey: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base.length === 0) {
    throw new Error("audio base url is not configured: a relative link cannot be fetched by WhatsApp");
  }
  return `${base}/a/${assetKey}`;
}
```

and inside the upload handler, immediately after the `upsert`, before the
response:

```ts
      // Write it into the lesson as a DRAFT. Publishing stays a separate,
      // deliberate act, so an upload can never put audio in front of a learner
      // on its own.
      const url = audioPublicUrl(process.env.PUBLIC_BASE_URL ?? "", verdict.assetKey);
      await writeAudioUrlDraft(verdict.lessonKey, verdict.language, url);
```

with this helper in the same file. Signatures verified against
`backend/src/config-platform/service.ts` and its Postgres counterpart, which
share them. Note that `updateDraft` takes the **actor first** and a **document
id**, not a namespace and key, so the lookup by key has to happen first. The
accessor is the same one every other route uses:

```ts
import { getConfigPlatformService } from "../config-platform/service.js";

/**
 * Merge one language's audio URL into the lesson's draft, leaving every other
 * field alone. Reads the published payload as the base so an upload does not
 * silently discard an unrelated edit sitting in an existing draft.
 *
 * A DRAFT, never a publish: an upload must not be able to put audio in front of
 * a learner on its own.
 */
async function writeAudioUrlDraft(
  lessonKey: string,
  language: string,
  url: string,
  actorId: string
): Promise<void> {
  const service = getConfigPlatformService();
  const existing = await service.getDocumentByNamespaceKey("content", lessonKey);
  if (!existing?.published) {
    return;
  }
  const payload = existing.published.payload as Record<string, unknown>;
  const audioUrls = {
    ...((payload.audioUrls as Record<string, string> | undefined) ?? {}),
    [language]: url
  };
  await service.updateDraft(
    { id: actorId, role: "editor" },
    existing.document.id,
    { payload: { ...payload, audioUrls }, changeSummary: `Audio uploaded for ${language}` }
  );
}
```

and change the call site in the upload handler to pass the actor:

```ts
      const url = audioPublicUrl(process.env.PUBLIC_BASE_URL ?? "", verdict.assetKey);
      await writeAudioUrlDraft(
        verdict.lessonKey,
        verdict.language,
        url,
        req.authUser?.id ?? "lesson-audio-upload"
      );
```

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test src/lessons/routes-audio.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lessons/routes-audio.ts backend/src/lessons/routes-audio.test.ts
git commit -m "feat(lessons): put an uploaded audio url into the lesson draft"
```

---

## Task 9: Verify against the real thing

- [ ] **Step 1: Full suites**

```bash
npm test -w @shetrades/backend
cd dashboard && npm run typecheck && npm run lint && npm test
```
Expected: backend all pass, dashboard typecheck exit 0, lint 0 errors

- [ ] **Step 2: Upload one real recording to staging**

```bash
curl -X POST "https://<backend-host>/api/admin/lesson-audio/m1_l1_m.en.m4a" \
  -H "authorization: Bearer <admin token>" \
  -H "content-type: audio/mp4" \
  --data-binary @m1_l1_m.en.m4a
```
Expected: `201` with `{"key":"m1_l1_m.en","lessonKey":"content.lesson.m1_l1_m",...}`

- [ ] **Step 3: Confirm the public route serves it**

```bash
curl -sI "https://www.shetrades.digital/a/m1_l1_m.en"
```
Expected: `200`, `content-type: audio/mp4`, `cache-control: public, max-age=86400`

If this 404s, the public path is not on the middleware allowlist. Add `/a/` to
`PUBLIC_PATH_PREFIXES` in `dashboard/lib/hosts.ts` and to the `/c/:path*` rewrite
pattern in `dashboard/next.config.ts` - see
`docs/public-admin-hostname-split.md`.

- [ ] **Step 4: Publish the lesson, then walk it in the sandbox**

Open Content, find the lesson, confirm the English audio link is filled in,
publish it. Then drive the bot through Settings → Integration → sandbox: open the
lesson and confirm a third button appears reading **🎧 Listen**. Tap it and
confirm an audio message is returned.

- [ ] **Step 5: One pass on a real handset before any learner sees it**

Confirm the audio actually plays, in WhatsApp, on a phone. Everything up to here
proves Meta accepted the message; only this proves the file is playable.

- [ ] **Step 6: Commit the docs**

Update `handoff.md` and `task-list.md` with what shipped, then:

```bash
git add handoff.md task-list.md
git commit -m "docs: record lesson audio"
```

---

## Deliberately out of scope

- **A "prefer audio" learner setting.** Only worth building if learners actually
  use the button. Ship it, watch it, then decide.
- **Duration or loudness checks.** Format and size are enforced; how the
  recording sounds is a production concern, not a platform one.
- **Audio for quiz questions.** `audioUrls` is per lesson. If quiz audio is ever
  wanted, that is a schema change and should be decided BEFORE 129 files are
  named and uploaded, not after.
- **Pidgin and Igbo recordings.** Those languages are still shown as coming soon.
  The naming convention already covers them, so nothing here blocks it.

## Two things to fix while you are here

Neither blocks this work; both are adjacent and cheap.

- **`audioUrls` has no URL validation on the live path.** A schema with
  `z.string().url()` exists at `config-platform/contracts.ts:69` but is
  deliberately not wired in, and the schema that runs treats the field as
  `record<string, unknown>`. Anything typed into the editor's audio box saves
  cleanly. Task 8 writes only well-formed URLs, but a hand-typed one is still
  unchecked.
- **A failed send is silent.** `sendWhatsAppMessage` logs a warning and returns
  normally, so an audio message Meta rejects looks to the learner like the
  Listen button doing nothing. The retry and visibility work is designed and
  parked; see the delivery-failure section of `handoff.md`.
