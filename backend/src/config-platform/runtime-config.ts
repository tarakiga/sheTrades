import { getConfigPlatformService } from "./service.js";
import type {
  NotificationIntegrationPayload,
  WhatsAppIntegrationPayload,
  RewardRulesPayload
} from "./contracts.js";
import type { PayoutsIntegrationPayload } from "../payouts/providers/contracts.js";

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

/** Test-only: inject an integration config without exercising the publish path. */
export function setRuntimeIntegrationConfigForTests(key: string, value: unknown) {
  if (value === null || value === undefined) {
    cachedIntegrationConfigs.delete(key);
  } else {
    cachedIntegrationConfigs.set(key, value);
  }
}

export type RuntimeLesson = {
  key: string;
  title: string;
  module: string;
  languages: {
    en: string;
    pcm?: string;
    ig?: string;
  };
  audioUrls: Record<string, string>;
  quiz: Array<{
    question: string;
    options: string[];
    answerIndex: number;
  }>;
};

export function getRuntimeLessons(): RuntimeLesson[] {
  const bundle = cachedPublicConfigs.get("content");
  if (!bundle) return [];
  return bundle.documents
    .filter((doc) => doc.key.startsWith("content.lesson."))
    .map((doc) => {
      const payload = doc.data || {};
      return {
        key: doc.key,
        title: String(payload.title || ""),
        module: String(payload.module || ""),
        languages: {
          en: String(payload.languages?.en || ""),
          ...(payload.languages?.pcm ? { pcm: String(payload.languages.pcm) } : {}),
          ...(payload.languages?.ig ? { ig: String(payload.languages.ig) } : {})
        },
        audioUrls: (payload.audioUrls && typeof payload.audioUrls === "object" ? payload.audioUrls : {}) as Record<string, string>,
        quiz: (Array.isArray(payload.quiz)
          ? payload.quiz.map((q: any) => ({
              question: String(q?.question || ""),
              options: Array.isArray(q?.options) ? q.options.map(String) : [],
              answerIndex: typeof q?.answerIndex === "number" ? q.answerIndex : 0
            }))
          : [])
      } satisfies RuntimeLesson;
    });
}


