import type { AnalyticsPageData } from "../contracts.js";

export type LiveAnalyticsAggregate = {
  registeredCount: number;
  startedCount: number;
  completedCount: number;
  attemptedCount: number;
  passedCount: number;
  anambraRegisteredCount: number;
  anambraCompletedCount: number;
  anambraPassedCount: number;
  deltaRegisteredCount: number;
  deltaCompletedCount: number;
  deltaPassedCount: number;
};

export type LiveAnalyticsRegionLabels = {
  anambraLabel: string;
  deltaLabel: string;
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

export function normalizeLiveAggregateRow(
  row: Partial<Record<keyof LiveAnalyticsAggregate, unknown>>
): LiveAnalyticsAggregate {
  return {
    registeredCount: toFiniteNumber(row.registeredCount),
    startedCount: toFiniteNumber(row.startedCount),
    completedCount: toFiniteNumber(row.completedCount),
    attemptedCount: toFiniteNumber(row.attemptedCount),
    passedCount: toFiniteNumber(row.passedCount),
    anambraRegisteredCount: toFiniteNumber(row.anambraRegisteredCount),
    anambraCompletedCount: toFiniteNumber(row.anambraCompletedCount),
    anambraPassedCount: toFiniteNumber(row.anambraPassedCount),
    deltaRegisteredCount: toFiniteNumber(row.deltaRegisteredCount),
    deltaCompletedCount: toFiniteNumber(row.deltaCompletedCount),
    deltaPassedCount: toFiniteNumber(row.deltaPassedCount)
  };
}

export function toAnalyticsPageDataFromLiveAggregate(
  aggregate: LiveAnalyticsAggregate,
  labels: LiveAnalyticsRegionLabels
): AnalyticsPageData {
  const registrationRate = percent(aggregate.startedCount, aggregate.registeredCount);
  const completionRate = percent(aggregate.completedCount, aggregate.registeredCount);
  const passRate = percent(aggregate.passedCount, aggregate.attemptedCount);

  const funnelOverall = `Registered ${aggregate.registeredCount} -> Started ${aggregate.startedCount} -> Completed ${aggregate.completedCount} -> Quiz Attempt ${aggregate.attemptedCount} -> Passed ${aggregate.passedCount}`;
  const funnelAnambra = `Completion ${percent(aggregate.anambraCompletedCount, aggregate.anambraRegisteredCount)} | Pass ${percent(aggregate.anambraPassedCount, aggregate.anambraRegisteredCount)} (${labels.anambraLabel})`;
  const funnelDelta = `Completion ${percent(aggregate.deltaCompletedCount, aggregate.deltaRegisteredCount)} | Pass ${percent(aggregate.deltaPassedCount, aggregate.deltaRegisteredCount)} (${labels.deltaLabel})`;

  return {
    registrationRate,
    completionRate,
    passRate,
    funnelOverall,
    funnelAnambra,
    funnelDelta
  };
}
