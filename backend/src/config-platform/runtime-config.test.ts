import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQuizItem, resetQuizWarningsForTests } from "./runtime-config.js";

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
  resetQuizWarningsForTests();
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
    assert.match(warnings[0] ?? "", /answer_index_unusable/);
  } finally {
    console.warn = originalWarn;
  }
});

test("a valid answerIndex produces no warning", () => {
  resetQuizWarningsForTests();
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

test("a repeated bad quiz item warns once, not once per inbound message", () => {
  // getRuntimeLessons() re-normalises the whole bundle on every inbound
  // WhatsApp message. Without the dedupe, one bad stored row would log
  // forever, at message volume.
  resetQuizWarningsForTests();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: unknown) => { warnings.push(String(msg)); };
  try {
    const bad = { question: "q", options: ["a", "b"], answerIndex: 9 };
    normalizeQuizItem(bad);
    normalizeQuizItem(bad);
    normalizeQuizItem(bad);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("a scored question with zero options is also warned about", () => {
  // Equally unanswerable, and previously silent.
  resetQuizWarningsForTests();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: unknown) => { warnings.push(String(msg)); };
  try {
    normalizeQuizItem({ question: "orphan question", options: [], answerIndex: 0 });
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("a non-numeric answerIndex is warned about rather than silently becoming 0", () => {
  resetQuizWarningsForTests();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: unknown) => { warnings.push(String(msg)); };
  try {
    const item = normalizeQuizItem({ question: "q", options: ["a", "b"], answerIndex: "5" });
    assert.equal(item.answerIndex, 0, "runtime coercion is unchanged");
    assert.equal(warnings.length, 1, "but it must no longer be silent");
  } finally {
    console.warn = originalWarn;
  }
});
