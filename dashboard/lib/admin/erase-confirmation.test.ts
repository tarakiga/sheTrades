import test from "node:test";
import assert from "node:assert/strict";

import { eraseConfirmationCopy } from "./erase-confirmation.js";

const PHONE = "2348030001111";

test("the title names the learner, so a wrong-row click is visible", () => {
  const copy = eraseConfirmationCopy("Amina Yusuf", PHONE);
  assert.equal(copy.title, "Delete everything about Amina Yusuf?");
});

test("the description carries both the name and the number", () => {
  const copy = eraseConfirmationCopy("Amina Yusuf", PHONE);
  assert.match(copy.description, /^Amina Yusuf, 2348030001111\./);
});

test("the number is always present, since names repeat and numbers do not", () => {
  for (const name of ["Amina Yusuf", null, undefined, "   "]) {
    assert.ok(
      eraseConfirmationCopy(name, PHONE).description.includes(PHONE),
      `the number must appear for name ${JSON.stringify(name)}`
    );
  }
});

test("a learner who never gave a name is still identified by her number", () => {
  // She can decline the notice before the name step, so an unnamed learner with
  // an erasure request is a real case, not a defensive branch.
  for (const name of [null, undefined, "", "   "]) {
    const copy = eraseConfirmationCopy(name, PHONE);
    assert.equal(copy.title, "Delete everything about this learner?");
    assert.match(copy.description, /^The learner on 2348030001111\./);
  }
});

test("a padded name is trimmed rather than rendered with its whitespace", () => {
  const copy = eraseConfirmationCopy("  Amina Yusuf  ", PHONE);
  assert.equal(copy.title, "Delete everything about Amina Yusuf?");
  assert.match(copy.description, /^Amina Yusuf, /);
});

test("irreversibility is stated, and stated early", () => {
  const copy = eraseConfirmationCopy("Amina Yusuf", PHONE);
  const position = copy.description.indexOf("This cannot be undone.");
  assert.notEqual(position, -1);
  // Immediately after the identity line - before the operator stops reading.
  assert.ok(position < 40, `"This cannot be undone." should come early, found at ${position}`);
});

test("the confirmation names what she loses, including the certificate link", () => {
  const { description } = eraseConfirmationCopy("Amina Yusuf", PHONE);
  for (const consequence of ["progress", "quiz results", "certificate", "verification link"]) {
    assert.ok(description.includes(consequence), `missing: ${consequence}`);
  }
});

test("the reward archive is described as de-identified, never as deleted", () => {
  // The rows survive erasure. Telling an operator they are deleted would make
  // the dialog a false statement about what the platform retains.
  const { description } = eraseConfirmationCopy("Amina Yusuf", PHONE);
  assert.ok(description.includes("kept without her name or number"));
});
