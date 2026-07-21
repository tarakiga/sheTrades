import test from "node:test";
import assert from "node:assert/strict";
import { extractUnits, hashSource, assembleDraftPayload } from "./extract.js";
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
