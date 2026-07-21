import { getConfigPlatformService } from "../config-platform/service.js";
import type { TranslationIntegrationPayload, TranslationLanguage } from "./providers/contracts.js";
import { adapterForLanguage } from "./providers/index.js";
import { assembleDraftPayload, extractUnits, hashSource } from "./extract.js";
import { getDraft, upsertMachineDraft } from "./draft-store.js";

export type BudgetInput = { dailyLimit: number; spentToday: number; perLesson: number; lessons: number };
export type BudgetPlan = { lessonsToRun: number; willStopForQuota: boolean };

/**
 * Decide how many lessons this run may translate without exceeding the daily
 * request cap. Uniform per-lesson cost (a safe over-estimate); a 0 cost means
 * the lesson consumes no requests, so all fit.
 */
export function planBudget(input: BudgetInput): BudgetPlan {
  const remaining = Math.max(0, input.dailyLimit - input.spentToday);
  if (input.perLesson <= 0) {
    return { lessonsToRun: input.lessons, willStopForQuota: false };
  }
  const fit = Math.floor(remaining / input.perLesson);
  const lessonsToRun = Math.min(input.lessons, fit);
  return { lessonsToRun, willStopForQuota: lessonsToRun < input.lessons };
}

/** Requests one lesson costs for a provider: unit count x requestsPerUnit (rounded up). */
export function estimateLessonCost(lesson: any, language: TranslationLanguage, requestsPerUnit: number): number {
  return Math.ceil(extractUnits(lesson, language).length * requestsPerUnit);
}

export type RunInput = {
  documentIds: string[] | "all";
  language: TranslationLanguage;
  config: TranslationIntegrationPayload;
  /** Requests already spent against the cap earlier today (caller-supplied). */
  spentToday?: number;
};

export type LoadedLesson = { id: string; key: string; payload: any };

export type RunDependencies = {
  /** Injectable so orchestration is testable without the config service. */
  loadLessons?: (documentIds: string[] | "all") => Promise<LoadedLesson[]>;
};

export type RunReport = {
  language: TranslationLanguage;
  attempted: number;
  translatedLessons: number;
  skipped: Array<{ id: string; reason: string }>;
  stoppedForQuota: boolean;
};

/** Load published content lessons from the config platform. */
async function defaultLoadLessons(documentIds: string[] | "all"): Promise<LoadedLesson[]> {
  const service = getConfigPlatformService();
  const contentResult = await service.listDocuments({ namespace: "content", page: 1, pageSize: 200 });
  const lessons: LoadedLesson[] = [];
  for (const item of contentResult.items) {
    if (!item.document.key.startsWith("content.lesson.")) continue;
    if (!item.document.isActive) continue;
    if (!item.published) continue;
    if (documentIds !== "all" && !documentIds.includes(item.document.id)) continue;
    lessons.push({ id: item.document.id, key: item.document.key, payload: item.published.payload });
  }
  return lessons;
}

/**
 * Translate a set of lessons into one language, pacing against the daily cap
 * and resuming safely:
 *  - a lesson whose draft is already up to date (same source hash, no failures)
 *    is SKIPPED, so re-running advances to the next untranslated lessons;
 *  - a draft a human has started reviewing is never overwritten (the draft
 *    store's upsert refuses it);
 *  - the run stops before it would exceed the cap; the caller re-runs later.
 */
export async function runTranslation(input: RunInput, deps: RunDependencies = {}): Promise<RunReport> {
  const load = deps.loadLessons ?? defaultLoadLessons;
  const lessons = await load(input.documentIds);
  const adapter = adapterForLanguage(input.config, input.language);

  // Which lessons still NEED work: no draft, or a stale/failed machine_draft.
  const needy: LoadedLesson[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const lesson of lessons) {
    const draft = await getDraft(lesson.id, input.language);
    const currentHash = hashSource(lesson.payload);
    if (draft) {
      if (draft.status !== "machine_draft") {
        skipped.push({ id: lesson.id, reason: `already ${draft.status}` });
        continue;
      }
      const summary = draft.runSummary as { failed?: number } | null;
      if (draft.sourceHash === currentHash && (summary?.failed ?? 0) === 0) {
        skipped.push({ id: lesson.id, reason: "up to date" });
        continue;
      }
    }
    needy.push(lesson);
  }

  // Pace against the cap using a conservative uniform per-lesson estimate.
  const perLesson = needy.length
    ? Math.max(...needy.map((l) => estimateLessonCost(l.payload, input.language, adapter.requestsPerUnit)))
    : 0;
  const plan = planBudget({
    dailyLimit: input.config.igboApi.dailyRequestLimit,
    spentToday: input.spentToday ?? 0,
    perLesson,
    lessons: needy.length
  });

  let translatedLessons = 0;
  for (const lesson of needy.slice(0, plan.lessonsToRun)) {
    const units = extractUnits(lesson.payload, input.language);
    const outcomes = await adapter.translate(units, input.config);
    const draftPayload = assembleDraftPayload(lesson.payload, outcomes);
    const failed = outcomes.filter((o) => o.status === "failed").length;
    const overBudget = outcomes.filter((o) => o.status === "translated" && o.overBudget).length;
    const res = await upsertMachineDraft({
      contentDocumentId: lesson.id,
      contentKey: lesson.key,
      targetLanguage: input.language,
      payload: draftPayload,
      runSummary: { translated: outcomes.length - failed, failed, overBudget },
      sourceHash: hashSource(lesson.payload)
    });
    if (res.skipped) skipped.push({ id: lesson.id, reason: res.reason ?? "skipped" });
    else translatedLessons += 1;
  }

  return {
    language: input.language,
    attempted: needy.length,
    translatedLessons,
    skipped,
    stoppedForQuota: plan.willStopForQuota
  };
}
