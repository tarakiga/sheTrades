import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOverallCounts,
  normalizeStateCounts,
  toAnalyticsPageDataFromLiveAggregate
} from "./analytics-live.js";

test("normalizeOverallCounts coerces unknown values to safe numbers", () => {
  const normalized = normalizeOverallCounts({
    registeredCount: "10",
    startedCount: 5,
    completedCount: "3",
    attemptedCount: "7",
    passedCount: "x"
  });

  assert.equal(normalized.registeredCount, 10);
  assert.equal(normalized.startedCount, 5);
  assert.equal(normalized.completedCount, 3);
  assert.equal(normalized.attemptedCount, 7);
  assert.equal(normalized.passedCount, 0);
});

test("normalizeStateCounts coerces and drops empty-state rows", () => {
  const rows = normalizeStateCounts([
    { state: "Anambra", registered: "40", completed: 24, passed: "20" },
    { state: "  ", registered: 5, completed: 1, passed: 0 },
    { state: "Lagos", registered: 10, completed: "5", passed: 4 }
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { state: "Anambra", registered: 40, completed: 24, passed: 20 });
  assert.equal(rows[1]?.state, "Lagos");
});

test("toAnalyticsPageDataFromLiveAggregate returns overall + dynamic per-state funnels", () => {
  const data = toAnalyticsPageDataFromLiveAggregate({
    registeredCount: 100,
    startedCount: 80,
    completedCount: 55,
    attemptedCount: 50,
    passedCount: 35,
    stateCounts: [
      { state: "Anambra", registered: 40, completed: 24, passed: 20 },
      { state: "Delta", registered: 30, completed: 12, passed: 9 },
      { state: "Lagos", registered: 10, completed: 5, passed: 4 }
    ]
  });

  assert.equal(data.registrationRate, "80.0%");
  assert.equal(data.completionRate, "55.0%");
  assert.equal(data.passRate, "70.0%");
  assert.equal(
    data.funnelOverall,
    "Registered 100 -> Started 80 -> Completed 55 -> Quiz Attempt 50 -> Passed 35"
  );
  assert.equal(data.stateFunnels.length, 3);
  assert.deepEqual(data.stateFunnels[0], {
    state: "Anambra",
    registered: 40,
    completed: 24,
    passed: 20,
    completionRate: "60.0%",
    passRate: "50.0%"
  });
  assert.equal(data.stateFunnels[2]?.state, "Lagos");
  assert.equal(data.stateFunnels[2]?.completionRate, "50.0%");
});
