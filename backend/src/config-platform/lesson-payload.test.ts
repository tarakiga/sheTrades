import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lessonDocumentPayloadSchema } from "./contracts.js";

/**
 * The config-platform publish path validated NOTHING for `lesson_content`
 * (`service.ts` returned the payload as-is, `postgres-service.ts` fell through
 * to `default`). A malformed `answerIndex` therefore reached the bot, where it
 * causes silent mis-scoring:
 *
 *   - `answerIndex === -1` used to make EVERY unrecognised reply score correct
 *     (fixed separately by a sentinel guard in isQuizReplyCorrect, but the bad
 *     data should never have got that far).
 *   - `answerIndex >= options.length` traps the learner: no reply can ever
 *     match, and the retry loop has no limit.
 *
 * The zod guard with `.min(0)` lives in `content/service.ts` — a DIFFERENT
 * write path that config-platform content bypasses entirely.
 *
 * This schema closes that gap. It is deliberately permissive about everything
 * except the bounds invariant, because 43 lessons are already live and a strict
 * schema would block publishing real content.
 */

const SEED_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "docs",
  "config-seeds",
  "lessons.seed.json"
);

test("every real seeded lesson still validates", () => {
  // The regression that matters most: this schema runs on the publish path for
  // live content. If it rejects a real lesson, the content team is blocked.
  const seeds = JSON.parse(readFileSync(SEED_PATH, "utf8")) as Array<{
    key: string;
    content: unknown;
  }>;
  assert.ok(seeds.length > 0, "seed file should not be empty");
  for (const seed of seeds) {
    const result = lessonDocumentPayloadSchema.safeParse(seed.content);
    assert.ok(
      result.success,
      `seeded lesson ${seed.key} was rejected: ${JSON.stringify(result.error?.issues)}`
    );
  }
});

test("a reflection question with a valid helpOptionIndex is accepted", () => {
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "My WhatsApp Business Shop",
    module: "Module 2",
    languages: { en: "body copy" },
    quiz: [
      {
        question: { en: "Did you run a chat backup today?" },
        options: [{ en: "Yes, system is set" }, { en: "I need help migrating" }, { en: "Not yet" }],
        answerIndex: 0,
        kind: "reflection",
        helpOptionIndex: 1
      }
    ]
  });
  assert.equal(result.success, true);
});

test("answerIndex past the end of the options is rejected", () => {
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "t",
    quiz: [{ question: "q", options: ["a", "b", "c"], answerIndex: 3 }]
  });
  assert.equal(result.success, false);
  // The message must name the offending value — a content editor sees this.
  const message = JSON.stringify(result.error?.issues);
  assert.match(message, /answerIndex/);
  assert.match(message, /3/);
});

test("a negative answerIndex is rejected", () => {
  // -1 is the specific value that used to make every unrecognised reply
  // score correct, because it collided with the resolver's no-match sentinel.
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "t",
    quiz: [{ question: "q", options: ["a", "b"], answerIndex: -1 }]
  });
  assert.equal(result.success, false);
});

test("a non-integer answerIndex is rejected", () => {
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "t",
    quiz: [{ question: "q", options: ["a", "b"], answerIndex: 1.5 }]
  });
  assert.equal(result.success, false);
});

test("a helpOptionIndex past the end of the options is rejected", () => {
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "t",
    quiz: [
      { question: "q", options: ["a", "b"], answerIndex: 0, kind: "reflection", helpOptionIndex: 5 }
    ]
  });
  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error?.issues), /helpOptionIndex/);
});

test("a lesson with no quiz is accepted", () => {
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "t",
    module: "Module 1",
    languages: { en: "body only, no quiz yet" }
  });
  assert.equal(result.success, true);
});

test("unknown keys are preserved, not stripped", () => {
  // Stripping would silently destroy admin-authored data on publish. A future
  // field must survive a round trip through validation even before this schema
  // knows about it.
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "t",
    somethingNew: { nested: true },
    quiz: [{ question: "q", options: ["a", "b"], answerIndex: 0, futureField: 42 }]
  });
  assert.equal(result.success, true);
  const parsed = result.data as Record<string, unknown>;
  assert.deepEqual(parsed.somethingNew, { nested: true });
  const quiz = parsed.quiz as Array<Record<string, unknown>>;
  assert.equal(quiz[0]?.futureField, 42);
});

test("legacy bare-string question and options are accepted", () => {
  // Localization is backward compatible: a value may be a plain string or an
  // {en,pcm,ig} object. Both shapes exist in live content.
  const result = lessonDocumentPayloadSchema.safeParse({
    title: "t",
    quiz: [{ question: "What is 2+2?", options: ["4", "5", "6"], answerIndex: 0 }]
  });
  assert.equal(result.success, true);
});
