import test from "node:test";
import assert from "node:assert/strict";
import {
  ERASURE_ORDER,
  generateRequestRef,
  needsConsent,
  resolveConsentReply
} from "./core.js";

const LABELS = { accept: "CONTINUE", decline: "EXIT" };

test("somebody who has never decided must be shown the notice", () => {
  assert.equal(needsConsent({ consentVersion: null }), true);
  assert.equal(needsConsent({ consentVersion: undefined }), true);
});

test("republishing the notice does not re-prompt anybody by itself", () => {
  // Otherwise fixing a typo interrupts every learner mid-lesson to re-accept a
  // document that has not materially changed.
  assert.equal(needsConsent({ consentVersion: 1 }), false);
  assert.equal(needsConsent({ consentVersion: 1, reconsentFromVersion: null }), false);
});

test("the re-consent lever asks anyone who agreed to something older", () => {
  assert.equal(needsConsent({ consentVersion: 1, reconsentFromVersion: 3 }), true);
  assert.equal(needsConsent({ consentVersion: 3, reconsentFromVersion: 3 }), false);
  assert.equal(needsConsent({ consentVersion: 4, reconsentFromVersion: 3 }), false);
});

test("a tapped button is read by its published label", () => {
  assert.equal(resolveConsentReply("CONTINUE", LABELS), "accepted");
  assert.equal(resolveConsentReply("EXIT", LABELS), "declined");
});

test("renaming the buttons does not break the gate", () => {
  // The labels are admin-editable config. Matching hard-coded strings would
  // silently stop recognising consent the first time somebody reworded them.
  const renamed = { accept: "Yes, continue", decline: "No, stop here" };
  assert.equal(resolveConsentReply("Yes, continue", renamed), "accepted");
  assert.equal(resolveConsentReply("No, stop here", renamed), "declined");
});

test("case, spacing and punctuation do not matter", () => {
  assert.equal(resolveConsentReply("  continue  ", LABELS), "accepted");
  assert.equal(resolveConsentReply("Continue.", LABELS), "accepted");
  assert.equal(resolveConsentReply("e x i t", { accept: "continue", decline: "e x i t" }), "declined");
});

test("a typed answer works when the buttons did not render", () => {
  for (const word of ["yes", "ok", "agree", "proceed"]) {
    assert.equal(resolveConsentReply(word, LABELS), "accepted", word);
  }
  for (const word of ["no", "stop", "cancel", "quit"]) {
    assert.equal(resolveConsentReply(word, LABELS), "declined", word);
  }
});

test("when one label contains the other, the ambiguous tap declines", () => {
  // The safe reading of an ambiguous answer is the one that collects no data.
  const overlapping = { accept: "continue", decline: "do not continue" };
  assert.equal(resolveConsentReply("do not continue", overlapping), "declined");
});

test("anything unrecognised is not consent", () => {
  for (const text of ["", "   ", "hello", "what is this", "1", "??"]) {
    assert.equal(resolveConsentReply(text, LABELS), "unclear", JSON.stringify(text));
  }
});

test("silence is not consent", () => {
  assert.equal(resolveConsentReply("", LABELS), "unclear");
});

test("erasure clears children before the user", () => {
  // Every learner relation except certificates is ON DELETE RESTRICT, so the
  // user row cannot go first.
  assert.equal(ERASURE_ORDER[ERASURE_ORDER.length - 1], "users");
  for (const child of ["certificates", "rewards", "quiz_attempts", "user_progress", "user_sessions"]) {
    assert.ok(
      ERASURE_ORDER.indexOf(child as never) < ERASURE_ORDER.indexOf("users" as never),
      `${child} must be cleared before users`
    );
  }
});

test("erasure includes outbound_messages, which nothing else would catch", () => {
  // It has no foreign key, only a phone string: it neither cascades nor blocks,
  // so forgetting it means an erasure that reports success while leaving her
  // number in the database.
  assert.ok(ERASURE_ORDER.includes("outbound_messages" as never));
});

test("a request reference is readable and free of confusable characters", () => {
  const ref = generateRequestRef();
  assert.match(ref, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/, ref);
  for (const confusable of ["0", "O", "1", "I", "L"]) {
    assert.ok(!ref.includes(confusable), `${ref} contains ${confusable}`);
  }
});

test("request references do not collide in practice", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i += 1) seen.add(generateRequestRef());
  assert.equal(seen.size, 5000);
});
