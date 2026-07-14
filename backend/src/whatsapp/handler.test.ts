import test from "node:test";
import assert from "node:assert/strict";
import { isQuizReplyCorrect } from "./handler.js";

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
