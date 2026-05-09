import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLiveAggregateRow,
  toAnalyticsPageDataFromLiveAggregate
} from "./analytics-live.js";

test("normalizeLiveAggregateRow coerces unknown values to safe numbers", () => {
  const normalized = normalizeLiveAggregateRow({
    registeredCount: "10",
    startedCount: 5,
    completedCount: "3",
    attemptedCount: "7",
    passedCount: "x",
    anambraRegisteredCount: undefined
  });

  assert.equal(normalized.registeredCount, 10);
  assert.equal(normalized.startedCount, 5);
  assert.equal(normalized.completedCount, 3);
  assert.equal(normalized.attemptedCount, 7);
  assert.equal(normalized.passedCount, 0);
  assert.equal(normalized.anambraRegisteredCount, 0);
  assert.equal(normalized.deltaPassedCount, 0);
});

test("toAnalyticsPageDataFromLiveAggregate returns stable funnel and percentage semantics", () => {
  const data = toAnalyticsPageDataFromLiveAggregate(
    {
      registeredCount: 100,
      startedCount: 80,
      completedCount: 55,
      attemptedCount: 50,
      passedCount: 35,
      anambraRegisteredCount: 40,
      anambraCompletedCount: 24,
      anambraPassedCount: 20,
      deltaRegisteredCount: 30,
      deltaCompletedCount: 12,
      deltaPassedCount: 9
    },
    { anambraLabel: "Anambra", deltaLabel: "Delta" }
  );

  assert.equal(data.registrationRate, "80.0%");
  assert.equal(data.completionRate, "55.0%");
  assert.equal(data.passRate, "70.0%");
  assert.equal(
    data.funnelOverall,
    "Registered 100 -> Started 80 -> Completed 55 -> Quiz Attempt 50 -> Passed 35"
  );
  assert.equal(data.funnelAnambra, "Completion 60.0% | Pass 50.0% (Anambra)");
  assert.equal(data.funnelDelta, "Completion 40.0% | Pass 30.0% (Delta)");
});
