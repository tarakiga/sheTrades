import { getConfigPlatformService } from "./service.js";
import type {
  IntegrationConfigPayload,
  NotificationIntegrationPayload,
  WhatsAppIntegrationPayload
} from "./contracts.js";

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

const service = getConfigPlatformService();

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
  const bundle = service.getPublishedConfig(namespace);
  return bundle.documents.find((document) => document.key === key)?.data;
}

function getPublishedIntegrationData(key: string) {
  return service.getPublishedDocumentByNamespaceKey("integration", key)?.published.payload ?? null;
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

export function getRuntimeIntegrationConfig<T extends IntegrationConfigPayload>(key: string) {
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
