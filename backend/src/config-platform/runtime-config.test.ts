import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQuizItem } from "./runtime-config.js";

test("a legacy quiz item with no kind defaults to scored", () => {
  const item = normalizeQuizItem({
    question: "What is 2+2?",
    options: ["4", "5", "6"],
    answerIndex: 0
  });
  assert.equal(item.kind, "scored");
  assert.equal(item.helpOptionIndex, undefined);
  assert.equal(item.answerIndex, 0);
  // The backward-compatibility guarantee is about the WHOLE item, not just the
  // new fields. Without these two assertions a broken options/question mapping
  // would pass every test in this file.
  assert.deepEqual(item.options, ["4", "5", "6"]);
  assert.equal(item.question, "What is 2+2?");
});

test("an explicit reflection item keeps its kind and help index", () => {
  const item = normalizeQuizItem({
    question: "Did you run a chat backup today?",
    options: ["Yes, system is set", "I need help migrating", "Not yet"],
    answerIndex: 0,
    kind: "reflection",
    helpOptionIndex: 1
  });
  assert.equal(item.kind, "reflection");
  assert.equal(item.helpOptionIndex, 1);
});

test("an unrecognised kind falls back to scored rather than throwing", () => {
  const item = normalizeQuizItem({
    question: "q",
    options: ["a", "b"],
    answerIndex: 0,
    kind: "banana"
  });
  assert.equal(item.kind, "scored");
});

test("an out-of-range helpOptionIndex is dropped", () => {
  const item = normalizeQuizItem({
    question: "q",
    options: ["a", "b"],
    answerIndex: 0,
    kind: "reflection",
    helpOptionIndex: 7
  });
  assert.equal(item.helpOptionIndex, undefined);
});

test("helpOptionIndex is ignored on a scored item", () => {
  const item = normalizeQuizItem({
    question: "q",
    options: ["a", "b"],
    answerIndex: 0,
    helpOptionIndex: 1
  });
  assert.equal(item.kind, "scored");
  assert.equal(item.helpOptionIndex, undefined);
});

test("an out-of-range answerIndex on stored content is warned about, not clamped", () => {
  // Content published before the publish-path validation existed is still in
  // the database. Such a question is unanswerable and the retry loop has no
  // limit, so it must be visible in logs. It is NOT clamped — inventing a
  // correct answer would fabricate an assessment result nobody authored.
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: unknown) => { warnings.push(String(msg)); };
  try {
    const item = normalizeQuizItem({
      question: "What is 2+2?",
      options: ["4", "5", "6"],
      answerIndex: 7
    });
    assert.equal(item.answerIndex, 7, "value must be preserved, not clamped");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /answer_index_out_of_range/);
  } finally {
    console.warn = originalWarn;
  }
});

test("a valid answerIndex produces no warning", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: unknown) => { warnings.push(String(msg)); };
  try {
    normalizeQuizItem({ question: "q", options: ["a", "b"], answerIndex: 1 });
    assert.equal(warnings.length, 0);
  } finally {
    console.warn = originalWarn;
  }
});
