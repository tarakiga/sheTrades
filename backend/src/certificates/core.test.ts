import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NAME_LENGTH,
  generatePublicId,
  isEligible,
  looksLikeAName,
  sanitiseLearnerName
} from "./core.js";

// ---- looksLikeAName ----
//
// Every rejected value below is a real one that was printed on an issued
// certificate in September and October 2026 (793 of 10,496).

const REPLY_WORDS = ["CONTINUE", "EXIT", "MENU", "hi", "Yes, use this name"];

test("real names pass, including single names and irregular casing", () => {
  for (const name of ["Ngozi Eze", "chukwuEMEKA", "Aisha", "Ọlá Adébáyọ̀", "Mary-Jane O'Neil", "Tosadep01"]) {
    assert.deepEqual(looksLikeAName(name, REPLY_WORDS), { ok: true }, name);
  }
});

test("a value with fewer than two letters is not a name", () => {
  for (const value of ["3", "1", ".", "...", "?", "F", "G6", "37"]) {
    assert.deepEqual(looksLikeAName(value, REPLY_WORDS), { ok: false, reason: "no_letters" }, value);
  }
});

test("a button label, menu command or greeting is not a name, whatever its case or punctuation", () => {
  for (const value of ["CONTINUE", "Continue", "exit", "MENU", "Hi", "hi!", " HI. ", "yes, use this name"]) {
    assert.deepEqual(looksLikeAName(value, REPLY_WORDS), { ok: false, reason: "reply_word" }, value);
  }
});

test("a phone number is never printed, alone or next to a name", () => {
  for (const value of ["08131087473", "Dorathy Hosea 09060668849", "07052697270justina english lagos", "Ada 0806 123 4567"]) {
    assert.deepEqual(looksLikeAName(value, REPLY_WORDS), { ok: false, reason: "phone_number" }, value);
  }
});

test("an internal menu id echoed back by a list tap is not a name", () => {
  for (const value of ["content.lesson.m3_l1_d", "module-4", "Zestysam_02"]) {
    assert.deepEqual(looksLikeAName(value, REPLY_WORDS), { ok: false, reason: "machine_id" }, value);
  }
});

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

test("bidi override characters are stripped", () => {
  // U+202E would render the rest of the name reversed. On a credential
  // whose whole point is being trustworthy, that is a spoofing vector.
  assert.deepEqual(sanitiseLearnerName("Ada\u202EOkeke"), {
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
