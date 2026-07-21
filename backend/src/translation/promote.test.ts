import test from "node:test";
import assert from "node:assert/strict";
import { mergeTranslationIntoPayload, promoteDraft } from "./promote.js";

const LIVE = {
  title: { en: "Shop" },
  module: "Module 2",
  languages: { en: "English body" },
  quiz: [{ question: { en: "Q?" }, options: [{ en: "A" }, { en: "B" }, { en: "C" }], answerIndex: 0 }]
};

// ---- Pure merge: the correctness core ----

test("merge sets only the target language, preserving English", () => {
  const draft = { title: "Ahia", body: "Igbo body", quiz: [{ question: "Q-ig", options: ["A-ig", "B-ig", "C-ig"] }] };
  const merged = mergeTranslationIntoPayload(LIVE, "ig", draft);
  assert.deepEqual(merged.title, { en: "Shop", ig: "Ahia" });
  assert.equal(merged.languages.ig, "Igbo body");
  assert.equal(merged.languages.en, "English body"); // untouched
  assert.deepEqual(merged.quiz[0].question, { en: "Q?", ig: "Q-ig" });
  assert.deepEqual(merged.quiz[0].options[0], { en: "A", ig: "A-ig" });
  assert.equal(merged.quiz[0].answerIndex, 0); // never touched
});

test("a question with any null option keeps ALL its options English", () => {
  const draft = { quiz: [{ question: "Q-ig", options: ["A-ig", null, "C-ig"] }] };
  const merged = mergeTranslationIntoPayload(LIVE, "ig", draft);
  assert.equal("ig" in (merged.quiz[0].options[0] as object), false);
  assert.equal("ig" in (merged.quiz[0].options[1] as object), false);
  assert.equal("ig" in (merged.quiz[0].options[2] as object), false);
  // The question itself still translates — only the OPTIONS are held back.
  assert.deepEqual(merged.quiz[0].question, { en: "Q?", ig: "Q-ig" });
});

test("merge never changes the option array length or order", () => {
  const draft = { quiz: [{ options: ["A-ig", "B-ig", "C-ig"] }] };
  const merged = mergeTranslationIntoPayload(LIVE, "ig", draft);
  assert.equal(merged.quiz[0].options.length, 3);
});

test("merge does not mutate the input live payload", () => {
  // Promotion must be pure — a caller may reuse the live payload.
  const draft = { title: "Ahia", quiz: [] };
  const before = JSON.stringify(LIVE);
  mergeTranslationIntoPayload(LIVE, "ig", draft);
  assert.equal(JSON.stringify(LIVE), before);
});

test("a bare-string title is upgraded to an object with both languages", () => {
  const live = { title: "Shop", languages: { en: "b" }, quiz: [] };
  const merged = mergeTranslationIntoPayload(live, "ig", { title: "Ahia", quiz: [] });
  assert.deepEqual(merged.title, { en: "Shop", ig: "Ahia" });
});

// ---- Orchestration: conflict guard + happy path (no DB) ----

function fakeService(over: Record<string, unknown> = {}) {
  const calls: { updateDraft: unknown[]; publishDocument: unknown[] } = { updateDraft: [], publishDocument: [] };
  const service = {
    getDocumentByNamespaceKey: async () => ({
      document: { id: "doc-1", key: "content.lesson.a" },
      draft: null, // no pending draft => no conflict
      published: { id: "pub-1", payload: LIVE }
    }),
    updateDraft: async (_a: unknown, _id: unknown, input: unknown) => {
      calls.updateDraft.push(input);
      return { document: { id: "doc-1" }, draft: { id: "new-draft-1" } };
    },
    publishDocument: async (_a: unknown, _id: unknown, input: unknown) => {
      calls.publishDocument.push(input);
      return {};
    },
    ...over
  };
  return { service, calls };
}

const ACTOR = { id: "admin-1", role: "admin" as const };
const APPROVED_DRAFT = {
  contentDocumentId: "doc-1", contentKey: "content.lesson.a", targetLanguage: "ig",
  status: "approved", payload: { title: "Ahia", body: "Igbo body", quiz: [{ question: "Q-ig", options: ["A-ig", "B-ig", "C-ig"] }] }
};

test("promote refuses when the content document has a pending draft", async () => {
  const { service } = fakeService({
    getDocumentByNamespaceKey: async () => ({
      document: { id: "doc-1", key: "content.lesson.a" },
      draft: { id: "someones-draft" }, // a pending unrelated edit
      published: { id: "pub-1", payload: LIVE }
    })
  });
  await assert.rejects(
    () => promoteDraft(ACTOR, "doc-1", "ig", {
      service: service as never,
      getDraftFn: async () => APPROVED_DRAFT as never,
      setStatusFn: async () => APPROVED_DRAFT as never
    }),
    /unpublished changes|pending/i
  );
});

test("promote refuses a draft that is not approved", async () => {
  const { service } = fakeService();
  await assert.rejects(
    () => promoteDraft(ACTOR, "doc-1", "ig", {
      service: service as never,
      getDraftFn: async () => ({ ...APPROVED_DRAFT, status: "in_review" }) as never,
      setStatusFn: async () => APPROVED_DRAFT as never
    }),
    /approved/i
  );
});

test("promote publishes the merged payload and marks the draft promoted", async () => {
  const { service, calls } = fakeService();
  let promotedTo = "";
  await promoteDraft(ACTOR, "doc-1", "ig", {
    service: service as never,
    getDraftFn: async () => APPROVED_DRAFT as never,
    setStatusFn: async (_d: string, _l: string, to: string) => { promotedTo = to; return APPROVED_DRAFT as never; }
  });
  // updateDraft got the MERGED payload — Igbo set, English preserved.
  const updateInput = calls.updateDraft[0] as { payload: any };
  assert.equal(updateInput.payload.languages.ig, "Igbo body");
  assert.equal(updateInput.payload.languages.en, "English body");
  // publishDocument used the draft id updateDraft returned (the atomic guard).
  const publishInput = calls.publishDocument[0] as { expectedDraftVersionId: string };
  assert.equal(publishInput.expectedDraftVersionId, "new-draft-1");
  // The draft advanced to promoted.
  assert.equal(promotedTo, "promoted");
});
