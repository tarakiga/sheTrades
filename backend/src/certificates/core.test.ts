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

test("internal whitespace collapses to single spaces", () => {
  assert.deepEqual(sanitiseLearnerName("Ada    Grace   Okeke"), {
    ok: true,
    value: "Ada Grace Okeke"
  });
});

test("empty and whitespace-only names are rejected", () => {
  assert.deepEqual(sanitiseLearnerName("   "), { ok: false, reason: "empty" });
});

test("zero-width characters are stripped, not treated as spaces", () => {
  // Invisible in a chat, but they corrupt the SVG text layer downstream.
  assert.deepEqual(sanitiseLearnerName("Ada\u200bOkeke"), {
    ok: true,
    value: "AdaOkeke"
  });
});

test("control characters are stripped", () => {
  assert.deepEqual(sanitiseLearnerName("Ada\u0000 Okeke"), {
    ok: true,
    value: "Ada Okeke"
  });
});

test("names longer than the cap are rejected, not silently truncated", () => {
  // Truncation would print half a name on a permanent credential; better to
  // ask again.
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
