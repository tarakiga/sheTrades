import test from "node:test";
import assert from "node:assert/strict";
import { extractUnits, hashSource, assembleDraftPayload, englishDraftFromLesson } from "./extract.js";
import { WHATSAPP_LIMITS } from "../whatsapp/constraints.js";

const LESSON = {
  title: "My WhatsApp Business Shop",
  module: "Module 2",
  languages: { en: "Using standard WhatsApp to run a busy shop is like..." },
  quiz: [
    {
      question: "Which tool shows products with prices?",
      options: ["Catalog", "Status only", "Profile photo"],
      answerIndex: 0
    }
  ]
};

test("extractUnits emits one unit per translatable string with position ids", () => {
  const units = extractUnits(LESSON, "ig");
  const ids = units.map((u) => u.id);
  assert.deepEqual(ids, ["title", "body", "q0.question", "q0.opt0", "q0.opt1", "q0.opt2"]);
});

test("quiz option units carry the 20-char WhatsApp budget", () => {
  const units = extractUnits(LESSON, "ig");
  const opt = units.find((u) => u.id === "q0.opt0");
  assert.equal(opt?.maxLength, WHATSAPP_LIMITS.buttonTitle);
  assert.match(opt?.context ?? "", /option|button/i);
});

test("body and title carry their own budgets and no false option budget", () => {
  const units = extractUnits(LESSON, "ig");
  assert.equal(units.find((u) => u.id === "body")?.maxLength, WHATSAPP_LIMITS.interactiveBody);
  assert.equal(units.find((u) => u.id === "title")?.maxLength, WHATSAPP_LIMITS.listRowTitle);
});

test("every unit targets the requested language", () => {
  for (const u of extractUnits(LESSON, "pcm")) assert.equal(u.targetLanguage, "pcm");
});

test("hashSource is stable and content-sensitive", () => {
  const a = hashSource(LESSON);
  assert.equal(a, hashSource({ ...LESSON }));
  const changed = { ...LESSON, languages: { en: "different body" } };
  assert.notEqual(a, hashSource(changed));
});

test("assembleDraftPayload reassembles by ID, immune to outcome order", () => {
  const outcomes = [
    { id: "q0.opt2", status: "translated", text: "C-ig", overBudget: false },
    { id: "title", status: "translated", text: "Title-ig", overBudget: false },
    { id: "q0.opt0", status: "translated", text: "A-ig", overBudget: false },
    { id: "body", status: "translated", text: "Body-ig", overBudget: false },
    { id: "q0.question", status: "translated", text: "Q-ig", overBudget: false },
    { id: "q0.opt1", status: "translated", text: "B-ig", overBudget: false }
  ] as const;
  const draft = assembleDraftPayload(LESSON, [...outcomes]);
  assert.equal(draft.title, "Title-ig");
  assert.equal(draft.body, "Body-ig");
  assert.deepEqual(draft.quiz[0]?.options, ["A-ig", "B-ig", "C-ig"]);
});

test("a failed option becomes null so the whole set stays English on promote", () => {
  const outcomes = [
    { id: "q0.opt0", status: "translated", text: "A-ig", overBudget: false },
    { id: "q0.opt1", status: "failed", reason: "boom", retryable: true },
    { id: "q0.opt2", status: "translated", text: "C-ig", overBudget: false }
  ] as const;
  const draft = assembleDraftPayload(LESSON, [...outcomes]);
  assert.deepEqual(draft.quiz[0]?.options, ["A-ig", null, "C-ig"]);
});

test("extract then assemble round-trips option COUNT exactly", () => {
  const units = extractUnits(LESSON, "ig").filter((u) => u.id.startsWith("q0.opt"));
  assert.equal(units.length, LESSON.quiz[0]!.options.length);
});

test("a multi-question lesson reassembles each question independently", () => {
  const lesson = {
    title: "T",
    languages: { en: "Body" },
    quiz: [
      { question: "Q0?", options: ["A", "B", "C"], answerIndex: 0 },
      { question: "Q1?", options: ["D", "E"], answerIndex: 1 }
    ]
  };
  // Deliberately shuffled, with q1.opt0 failed.
  const outcomes = [
    { id: "q1.opt1", status: "translated", text: "E-ig", overBudget: false },
    { id: "q0.opt2", status: "translated", text: "C-ig", overBudget: false },
    { id: "q1.opt0", status: "failed", reason: "boom", retryable: true },
    { id: "q0.opt0", status: "translated", text: "A-ig", overBudget: false },
    { id: "q0.opt1", status: "translated", text: "B-ig", overBudget: false },
    { id: "q1.question", status: "translated", text: "Q1-ig", overBudget: false },
    { id: "q0.question", status: "translated", text: "Q0-ig", overBudget: false }
  ] as const;
  const draft = assembleDraftPayload(lesson, [...outcomes]);
  assert.deepEqual(draft.quiz[0]?.options, ["A-ig", "B-ig", "C-ig"]);
  assert.deepEqual(draft.quiz[1]?.options, [null, "E-ig"]);
  assert.equal(draft.quiz[0]?.question, "Q0-ig");
  assert.equal(draft.quiz[1]?.question, "Q1-ig");
});

test("an empty-string option still emits a unit so positions never shift", () => {
  const lesson = {
    title: "T",
    languages: { en: "Body" },
    quiz: [{ question: "Q?", options: ["A", "", "C"], answerIndex: 0 }]
  };
  const optionUnits = extractUnits(lesson, "ig").filter((u) => u.id.startsWith("q0.opt"));
  // Three units for three options — the empty one is NOT skipped.
  assert.deepEqual(optionUnits.map((u) => u.id), ["q0.opt0", "q0.opt1", "q0.opt2"]);
  assert.equal(optionUnits.length, 3);
});

test("englishDraftFromLesson returns the English strings in draft shape", () => {
  const src = englishDraftFromLesson(LESSON);
  assert.equal(src.title, "My WhatsApp Business Shop");
  assert.equal(src.body, "Using standard WhatsApp to run a busy shop is like...");
  assert.equal(src.quiz[0]?.question, "Which tool shows products with prices?");
  assert.deepEqual(src.quiz[0]?.options, ["Catalog", "Status only", "Profile photo"]);
});

test("englishDraftFromLesson reads localized-object English too", () => {
  const lesson = {
    title: { en: "T", ig: "T-ig" },
    languages: { en: "Body", ig: "Body-ig" },
    quiz: [{ question: { en: "Q?" }, options: [{ en: "A" }, { en: "B" }], answerIndex: 0 }]
  };
  const src = englishDraftFromLesson(lesson);
  assert.equal(src.title, "T");        // English, not the ig variant
  assert.equal(src.body, "Body");
  assert.deepEqual(src.quiz[0]?.options, ["A", "B"]);
});
