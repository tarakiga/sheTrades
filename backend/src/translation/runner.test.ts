import test from "node:test";
import assert from "node:assert/strict";
import { planBudget, estimateLessonCost, runTranslation } from "./runner.js";
import type { TranslationIntegrationPayload } from "./providers/contracts.js";

test("planBudget stops before a lesson that would exceed the daily cap", () => {
  // 500 cap, 480 already spent today, each lesson needs 14 requests.
  const plan = planBudget({ dailyLimit: 500, spentToday: 480, perLesson: 14, lessons: 5 });
  assert.equal(plan.lessonsToRun, 1); // 480+14=494 fits; a 2nd (508) would exceed
  assert.equal(plan.willStopForQuota, true);
});

test("planBudget runs everything when the cap is ample", () => {
  const plan = planBudget({ dailyLimit: 2500, spentToday: 0, perLesson: 14, lessons: 43 });
  assert.equal(plan.lessonsToRun, 43);
  assert.equal(plan.willStopForQuota, false);
});

test("planBudget runs nothing when the cap is already spent", () => {
  const plan = planBudget({ dailyLimit: 500, spentToday: 500, perLesson: 14, lessons: 5 });
  assert.equal(plan.lessonsToRun, 0);
  assert.equal(plan.willStopForQuota, true);
});

test("planBudget with a zero per-lesson cost never divides by zero", () => {
  // A lesson with no translatable strings costs 0 requests — must not hang or NaN.
  const plan = planBudget({ dailyLimit: 500, spentToday: 0, perLesson: 0, lessons: 3 });
  assert.equal(plan.lessonsToRun, 3);
  assert.equal(plan.willStopForQuota, false);
});

test("estimateLessonCost is unit count times requestsPerUnit", () => {
  const lesson = {
    title: "T",
    languages: { en: "Body" },
    quiz: [{ question: "Q?", options: ["A", "B", "C"], answerIndex: 0 }]
  };
  // title + body + question + 3 options = 6 units; requestsPerUnit 1 => 6.
  assert.equal(estimateLessonCost(lesson, "ig", 1), 6);
  // A batching provider with requestsPerUnit 0.5 (hypothetical) rounds up.
  assert.equal(estimateLessonCost(lesson, "ig", 2), 12);
});

// ---- Orchestration: no DB, no network — injected loadLessons only ----

const emptyConfig: TranslationIntegrationPayload = {
  title: "Translation",
  enabled: true,
  providerByLanguage: { pcm: "gemini", ig: "igbo_api" },
  igboApi: { apiKey: "", baseUrl: "https://igboapi.com", dailyRequestLimit: 500 },
  gemini: { apiKey: "", model: "gemini-2.5-flash" },
  anthropic: { apiKey: "", model: "claude-sonnet-5" },
  notes: ""
};

test("runTranslation with no lessons touches nothing and reports zero work", async () => {
  const report = await runTranslation(
    { documentIds: "all", language: "ig", config: emptyConfig },
    { loadLessons: async () => [] }
  );
  assert.equal(report.attempted, 0);
  assert.equal(report.translatedLessons, 0);
  assert.equal(report.stoppedForQuota, false);
  assert.deepEqual(report.skipped, []);
});
