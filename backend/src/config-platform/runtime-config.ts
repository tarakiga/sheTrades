import { getConfigPlatformService } from "./service.js";
import type {
  NotificationIntegrationPayload,
  WhatsAppIntegrationPayload,
  RewardRulesPayload
} from "./contracts.js";
import type { PayoutsIntegrationPayload } from "../payouts/providers/contracts.js";
import type { TranslationIntegrationPayload } from "../translation/providers/contracts.js";

type LocalizedText = {
  en: string;
  pcm?: string;
  ig?: string;
};

type OptionItem = {
  id: string;
  value: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  metadata?: Record<string, unknown>;
};

// Write-through in-memory cache
const cachedPublicConfigs = new Map<string, { versionTag: string; documents: any[] }>();
const cachedIntegrationConfigs = new Map<string, any>();
let isInitialized = false;

export async function refreshRuntimeConfigCache() {
  const service = getConfigPlatformService();

  // Refresh content, options, legal namespaces
  const namespaces: Array<"content" | "options" | "legal"> = ["content", "options", "legal"];
  for (const ns of namespaces) {
    const bundle = await service.getPublishedConfig(ns);
    cachedPublicConfigs.set(ns, bundle);
  }

  // Refresh integration configs
  const result = await service.listDocuments({
    namespace: "integration",
    page: 1,
    pageSize: 100
  });

  cachedIntegrationConfigs.clear();
  for (const item of result.items) {
    if (item.published && item.document.isActive) {
      cachedIntegrationConfigs.set(item.document.key, item.published.payload);
    }
  }
}

export async function ensureCacheInitialized() {
  if (isInitialized) return;
  await refreshRuntimeConfigCache();
  isInitialized = true;
}

function readFirstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstString(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["en", "pcm", "ig"]) {
      const found = readFirstString(obj[key]);
      if (found) return found;
    }
    for (const nested of Object.values(obj)) {
      const found = readFirstString(nested);
      if (found) return found;
    }
  }
  return null;
}

function getPublishedData(namespace: "content" | "options" | "legal", key: string) {
  const bundle = cachedPublicConfigs.get(namespace);
  if (!bundle) return null;
  return bundle.documents.find((document) => document.key === key)?.data;
}

function getPublishedIntegrationData(key: string) {
  return cachedIntegrationConfigs.get(key) ?? null;
}

export function getRuntimeText(key: string, fallback: string) {
  const data = getPublishedData("content", key);
  const resolved = readFirstString(data);
  return resolved ?? fallback;
}

/**
 * White-label branding. Read from the published `branding.identity` content
 * document so a partner organisation can rename the product and re-theme it with
 * no code change. Every field falls back to the SheTrades defaults so the app
 * still renders on a fresh deploy with nothing published.
 */
export type RuntimeBranding = {
  organisationName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
};

export const BRANDING_FALLBACK: RuntimeBranding = {
  organisationName: "SheTrades",
  primaryColor: "#334e58",
  secondaryColor: "#ffbe22",
  accentColor: "#f0a90e",
  fontFamily: "Inter"
};

export function getRuntimeBranding(): RuntimeBranding {
  const data = getPublishedData("content", "branding.identity");
  if (!data || typeof data !== "object") return BRANDING_FALLBACK;
  const record = data as Record<string, unknown>;
  const str = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  return {
    organisationName: str(record.organisationName, BRANDING_FALLBACK.organisationName),
    primaryColor: str(record.primaryColor, BRANDING_FALLBACK.primaryColor),
    secondaryColor: str(record.secondaryColor, BRANDING_FALLBACK.secondaryColor),
    accentColor: str(record.accentColor, BRANDING_FALLBACK.accentColor),
    fontFamily: str(record.fontFamily, BRANDING_FALLBACK.fontFamily)
  };
}

export function getRuntimeLocalizedText(key: string, fallback: LocalizedText): LocalizedText {
  const data = getPublishedData("content", key);
  if (!data || typeof data !== "object") {
    return fallback;
  }
  const payload = data as Record<string, unknown>;
  const en = readFirstString(payload.en) ?? fallback.en;
  const pcm = readFirstString(payload.pcm) ?? fallback.pcm;
  const ig = readFirstString(payload.ig) ?? fallback.ig;
  return {
    en,
    ...(pcm ? { pcm } : {}),
    ...(ig ? { ig } : {})
  };
}

export function getRuntimeOptionSet(key: string): Array<OptionItem> {
  const data = getPublishedData("options", key);
  if (!data || typeof data !== "object") return [];
  const items = (data as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        typeof row.value !== "string" ||
        typeof row.label !== "string" ||
        typeof row.enabled !== "boolean" ||
        typeof row.sortOrder !== "number"
      ) {
        return null;
      }
      return {
        id: row.id,
        value: row.value,
        label: row.label,
        enabled: row.enabled,
        sortOrder: row.sortOrder,
        ...(row.metadata && typeof row.metadata === "object"
          ? { metadata: row.metadata as Record<string, unknown> }
          : {})
      } satisfies OptionItem;
    })
    .filter((item): item is OptionItem => Boolean(item))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getRuntimeNumericPolicy(key: string, fallback: number) {
  const options = getRuntimeOptionSet(key);
  const first = options.find((item) => item.enabled);
  if (!first) return fallback;
  const parsed = Number(first.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// TODO(payouts): the generic constraint was relaxed in Task 2 (was
// `<T extends IntegrationConfigPayload>`) to avoid cross-module import
// from config-platform → payouts. Restore a constraint once the payouts
// payload schema is hoisted into a shared types module — or add
// PayoutsIntegrationPayload to IntegrationConfigPayload directly.
export function getRuntimeIntegrationConfig<T>(key: string) {
  const data = getPublishedIntegrationData(key);
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as T;
}

export function getRuntimeWhatsAppConfig() {
  return getRuntimeIntegrationConfig<WhatsAppIntegrationPayload>("integration.whatsapp.primary");
}

export function getRuntimeNotificationConfig() {
  return getRuntimeIntegrationConfig<NotificationIntegrationPayload>("integration.notification.smtp");
}

export function getRuntimePayoutsConfig() {
  return getRuntimeIntegrationConfig<PayoutsIntegrationPayload>("integration.payouts.primary");
}

export function getRuntimeRewardRules() {
  return getRuntimeIntegrationConfig<RewardRulesPayload>("reward.rules.primary");
}

export function getRuntimeTranslationConfig() {
  return getRuntimeIntegrationConfig<TranslationIntegrationPayload & { kind: "translation" }>(
    "integration.translation.primary"
  );
}

/** Test-only: inject an integration config without exercising the publish path. */
export function setRuntimeIntegrationConfigForTests(key: string, value: unknown) {
  if (value === null || value === undefined) {
    cachedIntegrationConfigs.delete(key);
  } else {
    cachedIntegrationConfigs.set(key, value);
  }
}

/**
 * A learner-facing string that may be language-aware. A bare string is legacy
 * content (treated as English); the object form carries per-language variants.
 * Backward compatible: all 43 pre-existing lessons store bare strings and keep
 * working unchanged.
 */
export type LocalizedValue = string | { en: string; pcm?: string; ig?: string };

/** Resolve a LocalizedValue for a language, falling back to English then "". */
export function pickLocalized(value: LocalizedValue | undefined | null, lang: string): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const variant = (value as Record<string, string>)[lang];
  return variant || value.en || "";
}

/** Normalize raw config JSON into a LocalizedValue, preserving legacy strings. */
function normalizeLocalized(raw: any): LocalizedValue {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return {
      en: String(raw.en ?? ""),
      ...(raw.pcm ? { pcm: String(raw.pcm) } : {}),
      ...(raw.ig ? { ig: String(raw.ig) } : {})
    };
  }
  return String(raw);
}

export type QuizItemKind = "scored" | "reflection";

export type RuntimeQuizItem = {
  question: LocalizedValue;
  options: LocalizedValue[];
  answerIndex: number;
  /**
   * "scored"     — a knowledge question with a right answer (default).
   * "reflection" — a check-in about what the learner DID. No right answer;
   *                every option is accepted. Marking "Not yet" wrong traps
   *                honest learners and pressures them into false claims,
   *                which corrupts completion data and reward payouts.
   */
  kind: QuizItemKind;
  /** Index of the "I need help" option, when kind === "reflection". */
  helpOptionIndex?: number;
};

export type RuntimeLesson = {
  key: string;
  title: LocalizedValue;
  module: string;
  languages: {
    en: string;
    pcm?: string;
    ig?: string;
  };
  audioUrls: Record<string, string>;
  quiz: RuntimeQuizItem[];
};

/**
 * Normalise one raw quiz item from published config JSON.
 *
 * Backward compatible by construction: a legacy item with no `kind` becomes
 * "scored", which is exactly today's behaviour. Nothing changes for the 43
 * live lessons until a human marks a question as reflective in the admin UI.
 */
/**
 * Signatures of quiz items already warned about, so a single bad stored row
 * logs once per process instead of once per inbound message. Exported only so
 * tests can reset it; nothing else should touch it.
 */
const warnedQuizItems = new Set<string>();

/** @internal test seam — clears the warn-once dedupe. */
export function resetQuizWarningsForTests(): void {
  warnedQuizItems.clear();
}

export function normalizeQuizItem(raw: any): RuntimeQuizItem {
  const kind: QuizItemKind = raw?.kind === "reflection" ? "reflection" : "scored";
  const options = Array.isArray(raw?.options) ? raw.options.map(normalizeLocalized) : [];

  const rawHelp = raw?.helpOptionIndex;
  const helpOptionIndex =
    kind === "reflection" &&
    typeof rawHelp === "number" &&
    Number.isInteger(rawHelp) &&
    rawHelp >= 0 &&
    rawHelp < options.length
      ? rawHelp
      : undefined;

  const answerIndex = typeof raw?.answerIndex === "number" ? raw.answerIndex : 0;

  // The publish path now rejects an out-of-range answerIndex, but content
  // published BEFORE that validation existed is still in the database. Such a
  // question is unanswerable — no reply can match it, and the retry loop has no
  // limit — so surface it rather than letting learners silently get stuck.
  // Deliberately NOT clamped: picking a "correct" answer on the learner's
  // behalf would invent an assessment result nobody authored.
  if (kind === "scored") {
    const rawAnswer = raw?.answerIndex;
    const unanswerable =
      options.length === 0 ||
      typeof rawAnswer !== "number" ||
      !Number.isInteger(rawAnswer) ||
      rawAnswer < 0 ||
      rawAnswer >= options.length;
    if (unanswerable) {
      const label = pickLocalized(normalizeLocalized(raw?.question), "en").slice(0, 80);
      // Deduped: getRuntimeLessons() re-normalises the whole bundle on every
      // inbound WhatsApp message, so an unguarded warn would log once per
      // message forever for a single bad row.
      const signature = `${label}|${String(rawAnswer)}|${options.length}`;
      if (!warnedQuizItems.has(signature)) {
        warnedQuizItems.add(signature);
        console.warn(
          JSON.stringify({
            event: "config.lesson.answer_index_unusable",
            answerIndex: rawAnswer,
            optionCount: options.length,
            question: label
          })
        );
      }
    }
  }

  return {
    question: normalizeLocalized(raw?.question),
    options,
    answerIndex,
    kind,
    ...(helpOptionIndex !== undefined ? { helpOptionIndex } : {})
  };
}

export function getRuntimeLessons(): RuntimeLesson[] {
  const bundle = cachedPublicConfigs.get("content");
  if (!bundle) return [];
  return bundle.documents
    .filter((doc) => doc.key.startsWith("content.lesson."))
    .map((doc) => {
      const payload = doc.data || {};
      return {
        key: doc.key,
        title: normalizeLocalized(payload.title),
        module: String(payload.module || ""),
        languages: {
          en: String(payload.languages?.en || ""),
          ...(payload.languages?.pcm ? { pcm: String(payload.languages.pcm) } : {}),
          ...(payload.languages?.ig ? { ig: String(payload.languages.ig) } : {})
        },
        audioUrls: (payload.audioUrls && typeof payload.audioUrls === "object" ? payload.audioUrls : {}) as Record<string, string>,
        quiz: (Array.isArray(payload.quiz) ? payload.quiz.map(normalizeQuizItem) : [])
      } satisfies RuntimeLesson;
    });
}


