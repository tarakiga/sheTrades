import type { RewardMilestone } from "../config-platform/contracts.js";

/**
 * Milestone incentive engine (client plan 2026-08: ₦500 after two modules,
 * ₦500 after the rest). Pure functions so the crossing rules are unit-testable
 * without a DB; the handler owns persistence.
 *
 * Award semantics are CATCH-UP (`completedModules >= threshold`), not
 * exact-crossing: a learner who was already past a milestone when the rule
 * went live earns it on their next module completion. The (userId, key)
 * uniqueness on the rewards table makes replays and catch-ups idempotent.
 */

export type MilestoneAward = { key: string; amount: number };

/**
 * Stable reward-dedup key for a milestone. Derived ONLY from the threshold —
 * never from the admin-editable label — because this string is the
 * (userId, module) uniqueness component on the rewards table: if a label
 * rename changed the key, every learner would be paid the milestone again.
 */
export function milestoneRewardKey(
  modulesCompleted: RewardMilestone["modulesCompleted"],
  totalModules: number
): string {
  if (modulesCompleted === "all") return "Milestone: all modules";
  void totalModules;
  return `Milestone: ${modulesCompleted} modules`;
}

/** Which milestones a learner has earned at this completion count. */
export function resolveMilestoneAwards(
  milestones: readonly RewardMilestone[],
  completedModules: number,
  totalModules: number
): MilestoneAward[] {
  const awards: MilestoneAward[] = [];
  const seen = new Set<string>();
  for (const milestone of milestones) {
    const threshold =
      milestone.modulesCompleted === "all" ? totalModules : milestone.modulesCompleted;
    if (threshold <= 0 || completedModules < threshold) continue;
    const key = milestoneRewardKey(milestone.modulesCompleted, totalModules);
    // Duplicate thresholds in config (or "all" colliding with an equal numeric
    // milestone) still yield distinct keys per spelling; identical spellings
    // collapse to one award.
    if (seen.has(key)) continue;
    seen.add(key);
    awards.push({ key, amount: milestone.amount });
  }
  return awards;
}

/**
 * Count fully-completed modules from a learner's completed lesson keys.
 * A module counts only when EVERY published lesson in it is complete; modules
 * with zero lessons never count (a half-authored module must not trigger the
 * "all modules" milestone early).
 */
export function countCompletedModules(
  completedLessonKeys: readonly string[],
  lessons: ReadonlyArray<{ key: string; module?: string | null }>
): { completedModules: number; totalModules: number } {
  const byModule = new Map<string, { total: number; done: number }>();
  const completed = new Set(completedLessonKeys);
  for (const lesson of lessons) {
    const moduleName = (lesson.module ?? "").trim() || "Unknown";
    const agg = byModule.get(moduleName) ?? { total: 0, done: 0 };
    agg.total += 1;
    if (completed.has(lesson.key)) agg.done += 1;
    byModule.set(moduleName, agg);
  }
  let completedModules = 0;
  for (const agg of byModule.values()) {
    if (agg.total > 0 && agg.done === agg.total) completedModules += 1;
  }
  return { completedModules, totalModules: byModule.size };
}
