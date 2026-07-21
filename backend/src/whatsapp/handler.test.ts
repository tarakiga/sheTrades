import test from "node:test";
import assert from "node:assert/strict";
import { isQuizReplyCorrect, resolveQuizOptionIndex } from "./handler.js";

// Real quiz whose CORRECT answer (index 0) is 22 chars — longer than the
// 20-char WhatsApp reply-button title limit. On real WhatsApp the tapped
// title is echoed back clipped to "Set who sees your in"; the dashboard
// sandbox echoes the full "Set who sees your info". Both must score correct.
const M1_L7_Q3 = ["Set who sees your info", "Increase your data", "Remove your contacts"];

test("clipped correct button title (WhatsApp) is scored correct", () => {
  // "Set who sees your info".slice(0, 20) === "Set who sees your in"
  assert.equal(isQuizReplyCorrect("Set who sees your in", M1_L7_Q3, 0), true);
});

test("full untruncated correct title (sandbox) is scored correct", () => {
  assert.equal(isQuizReplyCorrect("Set who sees your info", M1_L7_Q3, 0), true);
});

test("clipped title matching is case-insensitive", () => {
  assert.equal(isQuizReplyCorrect("SET WHO SEES YOUR IN", M1_L7_Q3, 0), true);
});

test("numeric answers still work (1 = first option)", () => {
  assert.equal(isQuizReplyCorrect("1", M1_L7_Q3, 0), true);
  assert.equal(isQuizReplyCorrect("2", M1_L7_Q3, 0), false);
});

test("numbered-prefix answers still work ('1.' / '1)')", () => {
  assert.equal(isQuizReplyCorrect("1. Set who sees your info", M1_L7_Q3, 0), true);
  assert.equal(isQuizReplyCorrect("1)", M1_L7_Q3, 0), true);
});

test("a wrong option (full text) is scored incorrect", () => {
  assert.equal(isQuizReplyCorrect("Increase your data", M1_L7_Q3, 0), false);
});

test("a wrong option whose clipped form collides with nothing is incorrect", () => {
  // M1 L7 Q2: correct index is 1 ("Updating settings"); opt[0]
  // "Deleting her WhatsApp" is 21 chars -> clipped "Deleting her WhatsAp".
  const q2 = ["Deleting her WhatsApp", "Updating settings", "Changing her number"];
  assert.equal(isQuizReplyCorrect("Deleting her WhatsAp", q2, 1), false);
  assert.equal(isQuizReplyCorrect("Updating settings", q2, 1), true);
});

test("very long correct answer (47 chars) matches its clipped title", () => {
  // M5 L7 Q2, answer index 1.
  const q = [
    "Post angry complains",
    "Message the electricity company's official page",
    "Let it be"
  ];
  // slice(0, 20) === "Message the electric"
  assert.equal(isQuizReplyCorrect("Message the electric", q, 1), true);
});

// Real Module 2 Lesson 6 check-in options. Option 1 is 21 chars, so WhatsApp
// clips its button title to "I need help migratin" — the resolver must still
// identify it, or the help path silently never fires on real devices.
const M2_L6_Q1 = ["Yes, system is set", "I need help migrating", "Not yet"];

test("resolveQuizOptionIndex matches a clipped button title", () => {
  assert.equal(resolveQuizOptionIndex("I need help migratin", M2_L6_Q1), 1);
});

test("resolveQuizOptionIndex matches full option text", () => {
  assert.equal(resolveQuizOptionIndex("I need help migrating", M2_L6_Q1), 1);
});

test("resolveQuizOptionIndex accepts a 1-based numeric reply", () => {
  assert.equal(resolveQuizOptionIndex("3", M2_L6_Q1), 2);
});

test("resolveQuizOptionIndex accepts a numbered-prefix reply", () => {
  assert.equal(resolveQuizOptionIndex("2. I need help migrating", M2_L6_Q1), 1);
});

test("resolveQuizOptionIndex is case-insensitive", () => {
  assert.equal(resolveQuizOptionIndex("NOT YET", M2_L6_Q1), 2);
});

test("resolveQuizOptionIndex returns -1 for unmatched free text", () => {
  assert.equal(resolveQuizOptionIndex("what does this mean", M2_L6_Q1), -1);
});

test("isQuizReplyCorrect scores the answer-key option correct and others incorrect", () => {
  assert.equal(isQuizReplyCorrect("Yes, system is set", M2_L6_Q1, 0), true);
  assert.equal(isQuizReplyCorrect("Not yet", M2_L6_Q1, 0), false);
});

test("a malformed answerIndex of -1 does not score unmatched replies correct", () => {
  assert.equal(isQuizReplyCorrect("what?", M2_L6_Q1, -1), false);
  assert.equal(isQuizReplyCorrect("", M2_L6_Q1, -1), false);
});

test("an exact full-text match wins over an earlier option's clipped-prefix collision", () => {
  // "Save money every day for rent".slice(0, 20) === "Save money every day"
  // (once trimmed/lowercased), which coincidentally equals the FULL text of
  // options[1]. The unambiguous exact match on index 1 must win over the
  // ambiguous clipped-prefix match on index 0.
  const opts = ["Save money every day for rent", "Save money every day", "Not sure"];
  assert.equal(resolveQuizOptionIndex("Save money every day", opts), 1);
});

test("an out-of-range numeric reply resolves to no option", () => {
  assert.equal(resolveQuizOptionIndex("9", M2_L6_Q1), -1);
  assert.equal(resolveQuizOptionIndex("0", M2_L6_Q1), -1);
});

test("whitespace-only input resolves to no option", () => {
  assert.equal(resolveQuizOptionIndex("   ", ["", "B"]), -1);
});
