import type { AnalyticsPageData, StateFunnel } from "../contracts.js";

/** Raw per-state learner counts (one row per location). */
export type LiveStateCount = {
  state: string;
  registered: number;
  completed: number;
  passed: number;
};

export type LiveAnalyticsAggregate = {
  registeredCount: number;
  startedCount: number;
  completedCount: number;
  attemptedCount: number;
  passedCount: number;
  stateCounts: LiveStateCount[];
};

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "0.0%";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function toFiniteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize the single overall-aggregate row (the five funnel counts). */
export function normalizeOverallCounts(
  row: Partial<Record<"registeredCount" | "startedCount" | "completedCount" | "attemptedCount" | "passedCount", unknown>>
): Pick<
  LiveAnalyticsAggregate,
  "registeredCount" | "startedCount" | "completedCount" | "attemptedCount" | "passedCount"
> {
  return {
    registeredCount: toFiniteNumber(row.registeredCount),
    startedCount: toFiniteNumber(row.startedCount),
    completedCount: toFiniteNumber(row.completedCount),
    attemptedCount: toFiniteNumber(row.attemptedCount),
    passedCount: toFiniteNumber(row.passedCount)
  };
}

/** Normalize the GROUP BY-location rows into per-state counts. */
export function normalizeStateCounts(
  rows: Array<Partial<Record<"state" | "registered" | "completed" | "passed", unknown>>>
): LiveStateCount[] {
  return rows
    .map((row) => ({
      state: typeof row.state === "string" ? row.state.trim() : "",
      registered: toFiniteNumber(row.registered),
      completed: toFiniteNumber(row.completed),
      passed: toFiniteNumber(row.passed)
    }))
    .filter((row) => row.state.length > 0);
}

export function toStateFunnels(stateCounts: LiveStateCount[]): StateFunnel[] {
  return stateCounts.map((row) => ({
    state: row.state,
    registered: row.registered,
    completed: row.completed,
    passed: row.passed,
    completionRate: percent(row.completed, row.registered),
    passRate: percent(row.passed, row.registered)
  }));
}

export function toAnalyticsPageDataFromLiveAggregate(
  aggregate: LiveAnalyticsAggregate
): AnalyticsPageData {
  const registrationRate = percent(aggregate.startedCount, aggregate.registeredCount);
  const completionRate = percent(aggregate.completedCount, aggregate.registeredCount);
  const passRate = percent(aggregate.passedCount, aggregate.attemptedCount);

  const funnelOverall = `Registered ${aggregate.registeredCount} -> Started ${aggregate.startedCount} -> Completed ${aggregate.completedCount} -> Quiz Attempt ${aggregate.attemptedCount} -> Passed ${aggregate.passedCount}`;

  return {
    registrationRate,
    completionRate,
    passRate,
    funnelOverall,
    stateFunnels: toStateFunnels(aggregate.stateCounts)
  };
}
