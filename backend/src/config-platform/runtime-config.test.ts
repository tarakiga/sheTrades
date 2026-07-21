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
