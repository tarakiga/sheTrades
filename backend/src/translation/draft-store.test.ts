import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  canOverwrite,
  upsertMachineDraft,
  getDraft,
  setStatus,
  type DraftStatus
} from "./draft-store.js";

const skipWithoutDb = process.env.POSTGRES_URL
  ? false
  : "requires POSTGRES_URL (translation drafts are DB-backed)";

// ---- Pure guards: always run ----

test("status transitions only move forward through the review stages", () => {
  assert.equal(canTransition("machine_draft", "in_review"), true);
  assert.equal(canTransition("in_review", "approved"), true);
  assert.equal(canTransition("approved", "promoted"), true);
  assert.equal(canTransition("approved", "machine_draft"), false); // no going back
  assert.equal(canTransition("machine_draft", "approved"), false);  // no skipping review
  assert.equal(canTransition("in_review", "in_review"), false);     // not a move
});

test("a re-run may overwrite a machine_draft but never reviewed work", () => {
  assert.equal(canOverwrite("machine_draft"), true);
  assert.equal(canOverwrite("in_review"), false);
  assert.equal(canOverwrite("approved"), false);
  assert.equal(canOverwrite("promoted"), false);
});

// ---- DB-backed: skip without Postgres ----

test("upsert creates a machine_draft; a re-run refuses to overwrite reviewed work", { skip: skipWithoutDb, concurrency: false }, async () => {
  const doc = `test-doc-${Date.now()}`;
  const first = await upsertMachineDraft({
    contentDocumentId: doc, contentKey: "content.lesson.test", targetLanguage: "ig",
    payload: { title: "A", quiz: [] }, runSummary: { translated: 1, failed: 0, overBudget: 0 },
    sourceHash: "hash1"
  });
  assert.equal(first.skipped, false);

  // Move it into review, then a re-run must skip it.
  await setStatus(doc, "ig", "in_review");
  const second = await upsertMachineDraft({
    contentDocumentId: doc, contentKey: "content.lesson.test", targetLanguage: "ig",
    payload: { title: "B", quiz: [] }, runSummary: null, sourceHash: "hash2"
  });
  assert.equal(second.skipped, true);

  const row = await getDraft(doc, "ig");
  assert.equal(row?.status, "in_review");
  assert.equal((row?.payload as { title?: string })?.title, "A"); // NOT overwritten with "B"
});

test("setStatus rejects an illegal transition", { skip: skipWithoutDb, concurrency: false }, async () => {
  const doc = `test-doc2-${Date.now()}`;
  await upsertMachineDraft({
    contentDocumentId: doc, contentKey: "content.lesson.test2", targetLanguage: "pcm",
    payload: {}, runSummary: null, sourceHash: "h"
  });
  await assert.rejects(() => setStatus(doc, "pcm", "promoted")); // machine_draft -> promoted skips review
});
