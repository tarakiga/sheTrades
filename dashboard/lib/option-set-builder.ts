/**
 * Pure parse/serialize model behind the visual Option Set editor
 * (`components/config/OptionSetBuilder.tsx`).
 *
 * An option_set payload is `{ title?, items: [{ id, value, label, enabled,
 * sortOrder, metadata? , ...unknown }], ...unknown }`. `metadata` is a free
 * bag whose shape differs per set (FAQ question/answer text, report cadence
 * configs, recipient emails, ...), so every metadata field is classified into
 * an editable kind and everything the classifier does not understand is
 * carried through untouched - a round-trip through the builder must never
 * drop or reshape data the admin did not edit.
 */

export type MetaFieldKind = "text" | "localized" | "number" | "boolean" | "json";

export type MetaField = {
  key: string;
  /** Keys typed in this session stay editable; parsed keys are locked. */
  keyEditable: boolean;
  kind: MetaFieldKind;
  /** kind === "text" */
  text: string;
  /** kind === "localized" */
  en: string;
  pcm: string;
  ig: string;
  /** kind === "number": raw editing buffer + last valid value. */
  numberRaw: string;
  numberValue: number;
  /** kind === "boolean" */
  checked: boolean;
  /** kind === "json": raw editing buffer + last valid parsed value. */
  jsonRaw: string;
  jsonValid: boolean;
  jsonValue: unknown;
};

export type BuilderOption = {
  /** Stable React key; equals the persisted id when one existed. */
  uid: string;
  id: string;
  value: string;
  /** UI-only: once the admin edits the value by hand, stop auto-slugging. */
  valueTouched: boolean;
  label: string;
  enabled: boolean;
  metadata: MetaField[];
  /** Item-level keys beyond the known contract, preserved verbatim. */
  extras: Record<string, unknown>;
};

export type OptionSetDraft = {
  title: string;
  hasTitle: boolean;
  options: BuilderOption[];
  /** Payload-level keys beyond title/items, preserved verbatim. */
  extras: Record<string, unknown>;
};

const LOCALIZED_KEYS = new Set(["en", "pcm", "ig"]);

function newUid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `uid_${Math.random().toString(36).slice(2)}`;
}

function isLocalizedObject(value: unknown): value is { en?: string; pcm?: string; ig?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || !keys.includes("en")) return false;
  return keys.every(
    (key) => LOCALIZED_KEYS.has(key) && typeof (value as Record<string, unknown>)[key] === "string"
  );
}

function emptyField(key: string, kind: MetaFieldKind, keyEditable: boolean): MetaField {
  return {
    key,
    keyEditable,
    kind,
    text: "",
    en: "",
    pcm: "",
    ig: "",
    numberRaw: "",
    numberValue: 0,
    checked: false,
    jsonRaw: "",
    jsonValid: true,
    jsonValue: null
  };
}

export function metaFieldFromValue(key: string, value: unknown): MetaField {
  if (typeof value === "string") {
    return { ...emptyField(key, "text", false), text: value };
  }
  if (isLocalizedObject(value)) {
    return {
      ...emptyField(key, "localized", false),
      en: value.en ?? "",
      pcm: value.pcm ?? "",
      ig: value.ig ?? ""
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ...emptyField(key, "number", false), numberRaw: String(value), numberValue: value };
  }
  if (typeof value === "boolean") {
    return { ...emptyField(key, "boolean", false), checked: value };
  }
  return {
    ...emptyField(key, "json", false),
    jsonRaw: JSON.stringify(value, null, 2),
    jsonValid: true,
    jsonValue: value
  };
}

export function metaFieldValue(field: MetaField): unknown {
  switch (field.kind) {
    case "text":
      return field.text;
    case "localized": {
      const hasTranslation = field.pcm.trim().length > 0 || field.ig.trim().length > 0;
      if (!hasTranslation) return { en: field.en };
      return {
        en: field.en,
        ...(field.pcm.trim() ? { pcm: field.pcm } : {}),
        ...(field.ig.trim() ? { ig: field.ig } : {})
      };
    }
    case "number":
      return field.numberValue;
    case "boolean":
      return field.checked;
    case "json":
      return field.jsonValue;
  }
}

/** Slug an admin-facing label into an internal value (faq_is_free style). */
export function slugifyOptionValue(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Parse a payload JSON string into the builder model. Returns null when the
 * payload is not an option set (no `items` array) so callers can fall back to
 * other editors.
 */
export function parseOptionSetDraft(payloadJson: string): OptionSetDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.items)) return null;

  const extras: Record<string, unknown> = {};
  Object.keys(record).forEach((key) => {
    if (key !== "title" && key !== "items") extras[key] = record[key];
  });

  const options: BuilderOption[] = (record.items as unknown[])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => {
      const metadataRaw =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {};
      const itemExtras: Record<string, unknown> = {};
      Object.keys(item).forEach((key) => {
        if (!["id", "value", "label", "enabled", "sortOrder", "metadata"].includes(key)) {
          itemExtras[key] = item[key];
        }
      });
      const id = typeof item.id === "string" && item.id.trim() ? item.id : "";
      return {
        uid: id || `row_${index}_${newUid()}`,
        id,
        value: typeof item.value === "string" ? item.value : String(item.value ?? ""),
        valueTouched: true,
        label: typeof item.label === "string" ? item.label : "",
        enabled: item.enabled !== false,
        metadata: Object.keys(metadataRaw).map((key) => metaFieldFromValue(key, metadataRaw[key])),
        extras: itemExtras
      } satisfies BuilderOption;
    });

  // Respect stored sortOrder when present, falling back to array order.
  const sortKeys = (record.items as Array<Record<string, unknown>>).map((item, index) =>
    typeof item?.sortOrder === "number" ? item.sortOrder : index + 1
  );
  const ordered = options
    .map((option, index) => ({ option, sortKey: sortKeys[index] ?? index + 1, index }))
    .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index)
    .map((entry) => entry.option);

  return {
    title: typeof record.title === "string" ? record.title : "",
    hasTitle: typeof record.title === "string",
    options: ordered,
    extras
  };
}

/** Serialize the builder model back to the stored payload JSON (2-space). */
export function serializeOptionSetDraft(draft: OptionSetDraft): string {
  const payload: Record<string, unknown> = {
    ...(draft.hasTitle || draft.title.trim() ? { title: draft.title } : {}),
    items: draft.options.map((option, index) => ({
      id: option.id || option.value || `option_${index + 1}`,
      value: option.value.trim(),
      label: option.label.trim(),
      enabled: option.enabled,
      sortOrder: index + 1,
      metadata: Object.fromEntries(
        option.metadata
          .filter((field) => field.key.trim().length > 0)
          .map((field) => [field.key.trim(), metaFieldValue(field)])
      ),
      ...option.extras
    })),
    ...draft.extras
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * A brand-new option copies the metadata *structure* (keys + kinds, empty
 * values) of a template row, so "Add option" on the FAQ set automatically
 * offers Question and Answer boxes without any FAQ-specific code.
 */
export function createOptionFromTemplate(template?: BuilderOption): BuilderOption {
  return {
    uid: newUid(),
    id: "",
    value: "",
    valueTouched: false,
    label: "",
    enabled: true,
    metadata: (template?.metadata ?? []).map((field) => emptyField(field.key, field.kind, false)),
    extras: {}
  };
}

/** First blocking problem in the draft, or null when it is safe to save. */
export function validateOptionSetDraft(draft: OptionSetDraft): string | null {
  if (draft.options.length === 0) return "Add at least one option before saving.";
  const seenValues = new Set<string>();
  for (const [index, option] of draft.options.entries()) {
    const position = `Option ${index + 1}`;
    if (!option.label.trim()) return `${position}: enter a display label.`;
    if (!option.value.trim()) return `${position}: enter an internal value.`;
    const normalized = option.value.trim().toLowerCase();
    if (seenValues.has(normalized)) {
      return `${position}: internal value "${option.value.trim()}" is used twice.`;
    }
    seenValues.add(normalized);
    const seenKeys = new Set<string>();
    for (const field of option.metadata) {
      if (!field.key.trim()) return `${position}: a detail field is missing its name.`;
      const keyNormalized = field.key.trim().toLowerCase();
      if (seenKeys.has(keyNormalized)) {
        return `${position}: detail field "${field.key.trim()}" appears twice.`;
      }
      seenKeys.add(keyNormalized);
      if (field.kind === "json" && !field.jsonValid) {
        return `${position}: detail field "${field.key.trim()}" has invalid JSON.`;
      }
    }
  }
  return null;
}

/** Humanize a metadata key for its field label ("hourUtc" -> "Hour Utc"). */
export function humanizeMetaKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return key;
  return spaced
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}
