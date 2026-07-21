import test from "node:test";
import assert from "node:assert/strict";
import { planBudget, estimateLessonCost, runTranslation } from "./runner.js";
import { translationIntegrationPayloadSchema, type TranslationIntegrationPayload, type TranslationProvider } from "./providers/contracts.js";
import { hashSource } from "./extract.js";

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

// ---- Orchestration: resumability rule, via injected getDraftFn/upsertFn/adapterOverride ----
// A capped paid API must never re-translate up-to-date work or clobber a
// draft a human has started reviewing — these tests prove the stub adapter's
// translateCalls genuinely stays 0 for both skip cases.

function stubAdapter(requestsPerUnit = 1): { adapter: TranslationProvider; translateCalls: number } {
  const ctx = { translateCalls: 0 };
  const adapter: TranslationProvider = {
    key: "gemini",
    supports: ["pcm", "ig"],
    requestsPerUnit,
    verifyCredentials: async () => ({ status: "healthy", latencyMs: 0, message: "" }),
    translate: async (units) => {
      ctx.translateCalls += 1;
      return units.map((u) => ({ id: u.id, status: "translated" as const, text: `${u.text}-x`, overBudget: false }));
    }
  };
  return { adapter, get translateCalls() { return ctx.translateCalls; } } as never;
}

const LESSON = {
  id: "doc-1",
  key: "content.lesson.a",
  payload: { title: "T", languages: { en: "Body" }, quiz: [{ question: "Q?", options: ["A", "B"], answerIndex: 0 }] }
};
const CONFIG = translationIntegrationPayloadSchema.parse({
  title: "t",
  providerByLanguage: { pcm: "gemini", ig: "gemini" },
  igboApi: { apiKey: "", baseUrl: "https://igboapi.com", dailyRequestLimit: 2500 }
});

test("a draft in review is skipped without calling the adapter", async () => {
  const stub = stubAdapter();
  const report = await runTranslation(
    { documentIds: "all", language: "ig", config: CONFIG },
    {
      loadLessons: async () => [LESSON],
      getDraftFn: async () => ({ status: "in_review", sourceHash: "whatever", runSummary: { failed: 0 } } as never),
      upsertFn: async () => ({ skipped: false }),
      adapterOverride: stub.adapter
    }
  );
  assert.equal(stub.translateCalls, 0);
  assert.equal(report.translatedLessons, 0);
  assert.equal(report.skipped[0]?.reason, "already in_review");
});

test("an up-to-date machine_draft is skipped so re-runs advance", async () => {
  const stub = stubAdapter();
  // The draft's sourceHash must equal hashSource(LESSON.payload).
  const report = await runTranslation(
    { documentIds: "all", language: "ig", config: CONFIG },
    {
      loadLessons: async () => [LESSON],
      getDraftFn: async () => ({ status: "machine_draft", sourceHash: hashSource(LESSON.payload), runSummary: { failed: 0 } } as never),
      upsertFn: async () => ({ skipped: false }),
      adapterOverride: stub.adapter
    }
  );
  assert.equal(stub.translateCalls, 0);
  assert.equal(report.skipped[0]?.reason, "up to date");
});

test("a stale machine_draft is re-translated", async () => {
  const stub = stubAdapter();
  const upserts: string[] = [];
  const report = await runTranslation(
    { documentIds: "all", language: "ig", config: CONFIG },
    {
      loadLessons: async () => [LESSON],
      getDraftFn: async () => ({ status: "machine_draft", sourceHash: "OLD-HASH", runSummary: { failed: 0 } } as never),
      upsertFn: async (i) => { upserts.push(i.contentDocumentId); return { skipped: false }; },
      adapterOverride: stub.adapter
    }
  );
  assert.equal(stub.translateCalls, 1);
  assert.equal(report.translatedLessons, 1);
  assert.deepEqual(upserts, ["doc-1"]);
});

test("the run stops at the daily cap and reports it", async () => {
  const stub = stubAdapter();
  const lessons = [
    { ...LESSON, id: "d1" },
    { ...LESSON, id: "d2" },
    { ...LESSON, id: "d3" }
  ];
  // LESSON.payload yields 5 units (title, body, question, 2 options), so a
  // cap of 5 fits exactly one lesson.
  const tinyCap = translationIntegrationPayloadSchema.parse({
    title: "t",
    providerByLanguage: { pcm: "gemini", ig: "gemini" },
    igboApi: { apiKey: "", baseUrl: "https://igboapi.com", dailyRequestLimit: 5 }
  });
  const report = await runTranslation(
    { documentIds: "all", language: "ig", config: tinyCap },
    {
      loadLessons: async () => lessons,
      getDraftFn: async () => null,
      upsertFn: async () => ({ skipped: false }),
      adapterOverride: stub.adapter
    }
  );
  assert.equal(report.stoppedForQuota, true);
  assert.ok(report.translatedLessons < lessons.length);
});
