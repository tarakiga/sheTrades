import test from "node:test";
import assert from "node:assert/strict";
import { lessonDocumentPayloadSchema } from "./contracts.js";
import { normalizeQuizItem } from "./runtime-config.js";

/**
 * The governing invariant for lesson publish validation:
 *
 *   **The schema must never reject a payload the bot already renders fine.**
 *
 * `validatePayloadForType` runs on `updateDraft` and `createDocument`, not just
 * publish — so a false positive doesn't merely block a release, it blocks an
 * editor from SAVING. With 43 lessons live and authored over months, rejecting
 * a shape we simply failed to anticipate is worse than the bug being fixed.
 *
 * A "does every seeded lesson still parse?" test cannot establish this: the six
 * seeds are shape-identical (bare-string questions and options, all three
 * languages present, `audioUrls: {}`), so they would pass under a schema far
 * stricter than intended. This table instead enumerates the shapes the RUNTIME
 * tolerates and asserts the schema tolerates each one too.
 *
 * Only genuinely learner-trapping data may be rejected — an index that points
 * at an option which does not exist, where no reply can ever match and the
 * retry loop has no limit.
 */

/** Shapes the runtime coerces to something safe — all must be accepted. */
const RUNTIME_TOLERATED: Array<{ label: string; payload: unknown }> = [
  { label: "quiz item with no answerIndex (runtime → 0)", payload: { quiz: [{ question: "q", options: ["a", "b"] }] } },
  { label: "quiz item with no options (runtime → [])", payload: { quiz: [{ question: "q", answerIndex: 0 }] } },
  { label: "quiz item with no question (runtime → '')", payload: { quiz: [{ options: ["a", "b"], answerIndex: 0 }] } },
  { label: "empty options array — half-authored question", payload: { quiz: [{ question: "", options: [], answerIndex: 0 }] } },
  { label: "languages with no en", payload: { languages: { pcm: "pidgin only" } } },
  { label: "empty languages object", payload: { languages: {} } },
  { label: "localized object with no en", payload: { title: { pcm: "naam" } } },
  { label: "localized question object with no en", payload: { quiz: [{ question: { ig: "ajụjụ" }, options: ["a"], answerIndex: 0 }] } },
  { label: "audioUrls with a null value", payload: { audioUrls: { en: null } } },
  { label: "audioUrls with a nested object", payload: { audioUrls: { en: { url: "x" } } } },
  { label: "audioUrls with a number", payload: { audioUrls: { en: 42 } } },
  { label: "unrecognised kind (runtime → scored)", payload: { quiz: [{ question: "q", options: ["a"], answerIndex: 0, kind: "survey" }] } },
  { label: "null title", payload: { title: null } },
  { label: "null quiz", payload: { quiz: null } },
  { label: "null languages", payload: { languages: null } },
  { label: "null audioUrls", payload: { audioUrls: null } },
  { label: "null helpOptionIndex", payload: { quiz: [{ question: "q", options: ["a"], answerIndex: 0, helpOptionIndex: null }] } },
  { label: "string answerIndex (runtime → 0)", payload: { quiz: [{ question: "q", options: ["a", "b"], answerIndex: "5" }] } },
  { label: "no quiz key at all", payload: { title: "t", module: "Module 1" } },
  { label: "empty quiz array", payload: { quiz: [] } },
  { label: "completely empty payload", payload: {} },
  { label: "bare-string question and options", payload: { quiz: [{ question: "What is 2+2?", options: ["4", "5"], answerIndex: 0 }] } },
  { label: "reflection with no helpOptionIndex", payload: { quiz: [{ question: "q", options: ["a", "b"], answerIndex: 0, kind: "reflection" }] } },
  { label: "unknown top-level key", payload: { title: "t", futureField: { nested: true } } },
  { label: "unknown quiz-item key", payload: { quiz: [{ question: "q", options: ["a"], answerIndex: 0, futureField: 1 }] } },
  { label: "two-option question", payload: { quiz: [{ question: "q", options: ["a", "b"], answerIndex: 1 }] } },
  { label: "answerIndex at the last valid index", payload: { quiz: [{ question: "q", options: ["a", "b", "c"], answerIndex: 2 }] } }
];

for (const { label, payload } of RUNTIME_TOLERATED) {
  test(`schema accepts what the runtime tolerates: ${label}`, () => {
    const result = lessonDocumentPayloadSchema.safeParse(payload);
    assert.ok(
      result.success,
      `schema is stricter than the runtime here — this would block an editor from saving.\n` +
        `payload: ${JSON.stringify(payload)}\n` +
        `issues: ${JSON.stringify(result.error?.issues)}`
    );
  });
}

/** Genuinely learner-trapping shapes — these MUST be rejected. */
const LEARNER_TRAPPING: Array<{ label: string; payload: unknown }> = [
  { label: "answerIndex past the end", payload: { quiz: [{ question: "q", options: ["a", "b", "c"], answerIndex: 3 }] } },
  { label: "negative answerIndex (collides with the no-match sentinel)", payload: { quiz: [{ question: "q", options: ["a", "b"], answerIndex: -1 }] } },
  { label: "non-integer answerIndex", payload: { quiz: [{ question: "q", options: ["a", "b"], answerIndex: 1.5 }] } },
  { label: "helpOptionIndex past the end", payload: { quiz: [{ question: "q", options: ["a", "b"], answerIndex: 0, kind: "reflection", helpOptionIndex: 5 }] } },
  { label: "answerIndex left pointing at a removed option", payload: { quiz: [{ question: "q", options: ["b", "c"], answerIndex: 2 }] } }
];

for (const { label, payload } of LEARNER_TRAPPING) {
  test(`schema rejects learner-trapping data: ${label}`, () => {
    const result = lessonDocumentPayloadSchema.safeParse(payload);
    assert.equal(result.success, false, `should have been rejected: ${JSON.stringify(payload)}`);
  });
}

test("the rejection message names which question is wrong", () => {
  // The admin error path forwards issue.message and drops issue.path, so an
  // unqualified message is unactionable on a lesson with several questions.
  const result = lessonDocumentPayloadSchema.safeParse({
    quiz: [
      { question: "fine", options: ["a", "b"], answerIndex: 0 },
      { question: "fine too", options: ["a", "b"], answerIndex: 1 },
      { question: "broken", options: ["a", "b"], answerIndex: 9 }
    ]
  });
  assert.equal(result.success, false);
  const message = result.error?.issues.map((i) => i.message).join(" ") ?? "";
  assert.match(message, /Question 3/);
  assert.match(message, /answerIndex 9/);
});

test("normalizeQuizItem does not throw on any runtime-tolerated shape", () => {
  // Guards the other direction: the table above claims the runtime tolerates
  // these. If normalizeQuizItem ever starts throwing on one, the table is
  // stale and the conformance claim is no longer meaningful.
  for (const { label, payload } of RUNTIME_TOLERATED) {
    const quiz = (payload as { quiz?: unknown[] }).quiz;
    if (!Array.isArray(quiz)) continue;
    for (const item of quiz) {
      assert.doesNotThrow(() => normalizeQuizItem(item), `normalizeQuizItem threw for: ${label}`);
    }
  }
});
