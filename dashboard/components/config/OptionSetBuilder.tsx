"use client";

import { useState } from "react";
import { Badge, Button, ConstraintMeter, EmptyState, Input, Select, Textarea } from "../ui";
import { waLen } from "../../lib/whatsapp-constraints";
import {
  createOptionFromTemplate,
  humanizeMetaKey,
  slugifyOptionValue,
  type BuilderOption,
  type MetaField,
  type MetaFieldKind,
  type OptionSetDraft
} from "../../lib/option-set-builder";

export type OptionSetBuilderProps = {
  draft: OptionSetDraft;
  onChange: (next: OptionSetDraft) => void;
  /** WhatsApp row-title budget (24) for sets the bot renders as list rows. */
  labelLimit?: number | undefined;
  /** Soft cap (10 for WhatsApp lists) - options past it show a warning. */
  maxOptions?: number | undefined;
  addLabel?: string | undefined;
  helperText?: string | undefined;
};

const NEW_FIELD_KINDS: Array<{ value: MetaFieldKind; label: string }> = [
  { value: "text", label: "Text" },
  { value: "localized", label: "Translated text (EN/PCM/IG)" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" }
];

function emptyMetaField(kind: MetaFieldKind): MetaField {
  return {
    key: "",
    keyEditable: true,
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

export function OptionSetBuilder({
  draft,
  onChange,
  labelLimit,
  maxOptions,
  addLabel = "Add Option",
  helperText
}: OptionSetBuilderProps) {
  const [expandedUid, setExpandedUid] = useState<string | null>(
    draft.options.length === 1 ? draft.options[0]?.uid ?? null : null
  );

  const updateOption = (uid: string, updater: (option: BuilderOption) => BuilderOption) => {
    onChange({
      ...draft,
      options: draft.options.map((option) => (option.uid === uid ? updater(option) : option))
    });
  };

  const updateField = (
    uid: string,
    fieldIndex: number,
    updater: (field: MetaField) => MetaField
  ) => {
    updateOption(uid, (option) => ({
      ...option,
      metadata: option.metadata.map((field, index) =>
        index === fieldIndex ? updater(field) : field
      )
    }));
  };

  const addOption = () => {
    const created = createOptionFromTemplate(draft.options[0]);
    onChange({ ...draft, options: [...draft.options, created] });
    setExpandedUid(created.uid);
  };

  const removeOption = (uid: string) => {
    onChange({ ...draft, options: draft.options.filter((option) => option.uid !== uid) });
    if (expandedUid === uid) setExpandedUid(null);
  };

  const moveOption = (uid: string, direction: "up" | "down") => {
    const index = draft.options.findIndex((option) => option.uid === uid);
    if (index === -1) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= draft.options.length) return;
    const next = [...draft.options];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(nextIndex, 0, moved);
    onChange({ ...draft, options: next });
  };

  const overCap = typeof maxOptions === "number" && draft.options.length > maxOptions;

  return (
    <div className="option-builder">
      <div className="option-builder__intro">
        <p className="option-builder__helper">
          {helperText ??
            "Each card is one choice people can pick. Use the label for what they see; the details below hold the content behind it."}
        </p>
        <Button size="sm" onClick={addOption}>
          {addLabel}
        </Button>
      </div>

      {overCap ? (
        <Badge variant="warning">
          {`WhatsApp lists show at most ${maxOptions} rows - options after #${maxOptions} will not appear in the chat.`}
        </Badge>
      ) : null}

      {draft.options.length === 0 ? (
        <EmptyState
          title="No options yet"
          description="Add the first choice to start building this list."
          action={<Button onClick={addOption}>{addLabel}</Button>}
        />
      ) : (
        <div className="option-builder__list">
          {draft.options.map((option, index) => {
            const expanded = expandedUid === option.uid;
            return (
              <section
                key={option.uid}
                className={`option-builder__item${expanded ? " option-builder__item--expanded" : ""}`}
              >
                <button
                  type="button"
                  className="option-builder__item-toggle"
                  aria-expanded={expanded}
                  onClick={() => setExpandedUid(expanded ? null : option.uid)}
                >
                  <span className="option-builder__item-title">
                    <span className="option-builder__item-index">#{index + 1}</span>
                    {option.label.trim() || "Untitled option"}
                  </span>
                  <span className="option-builder__item-badges">
                    <Badge variant={option.enabled ? "success" : "neutral"}>
                      {option.enabled ? "Enabled" : "Hidden"}
                    </Badge>
                    <span className="option-builder__chevron" aria-hidden="true">
                      {expanded ? "▾" : "▸"}
                    </span>
                  </span>
                </button>

                {expanded ? (
                  <div className="option-builder__item-body">
                    <div className="option-builder__item-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => moveOption(option.uid, "up")}
                      >
                        Move Up
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === draft.options.length - 1}
                        onClick={() => moveOption(option.uid, "down")}
                      >
                        Move Down
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          updateOption(option.uid, (current) => ({
                            ...current,
                            enabled: !current.enabled
                          }))
                        }
                      >
                        {option.enabled ? "Hide" : "Show"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => removeOption(option.uid)}>
                        Remove
                      </Button>
                    </div>

                    <div className="option-builder__identity">
                      <div>
                        <Input
                          id={`option-label-${option.uid}`}
                          label="Label (what people see)"
                          value={option.label}
                          placeholder="Is it free?"
                          onChange={(event) => {
                            const label = event.target.value;
                            updateOption(option.uid, (current) => ({
                              ...current,
                              label,
                              value:
                                current.valueTouched || current.id
                                  ? current.value
                                  : slugifyOptionValue(label)
                            }));
                          }}
                        />
                        {typeof labelLimit === "number" ? (
                          <ConstraintMeter
                            used={waLen(option.label)}
                            limit={labelLimit}
                            label="WhatsApp row title"
                            overflow="truncate"
                          />
                        ) : null}
                      </div>
                      <Input
                        id={`option-value-${option.uid}`}
                        label="Internal value"
                        value={option.value}
                        placeholder="is_it_free"
                        onChange={(event) =>
                          updateOption(option.uid, (current) => ({
                            ...current,
                            value: event.target.value,
                            valueTouched: true
                          }))
                        }
                      />
                    </div>

                    {option.metadata.length > 0 ? (
                      <div className="option-builder__fields">
                        {option.metadata.map((field, fieldIndex) => (
                          <div
                            key={`${option.uid}-field-${fieldIndex}`}
                            className="option-builder__field"
                          >
                            <div className="option-builder__field-head">
                              {field.keyEditable ? (
                                <Input
                                  id={`option-${option.uid}-field-key-${fieldIndex}`}
                                  label="Detail name"
                                  value={field.key}
                                  placeholder="question"
                                  onChange={(event) =>
                                    updateField(option.uid, fieldIndex, (current) => ({
                                      ...current,
                                      key: event.target.value
                                    }))
                                  }
                                />
                              ) : (
                                <span className="option-builder__field-label">
                                  {humanizeMetaKey(field.key)}
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  updateOption(option.uid, (current) => ({
                                    ...current,
                                    metadata: current.metadata.filter(
                                      (_, idx) => idx !== fieldIndex
                                    )
                                  }))
                                }
                              >
                                Remove field
                              </Button>
                            </div>

                            {field.kind === "text" ? (
                              <Textarea
                                id={`option-${option.uid}-field-${fieldIndex}`}
                                label=""
                                aria-label={humanizeMetaKey(field.key) || "Detail value"}
                                rows={field.text.length > 80 || field.text.includes("\n") ? 4 : 2}
                                value={field.text}
                                onChange={(event) =>
                                  updateField(option.uid, fieldIndex, (current) => ({
                                    ...current,
                                    text: event.target.value
                                  }))
                                }
                              />
                            ) : null}

                            {field.kind === "localized" ? (
                              <div className="option-builder__localized">
                                {(
                                  [
                                    ["en", "English"],
                                    ["pcm", "Pidgin"],
                                    ["ig", "Igbo"]
                                  ] as const
                                ).map(([lang, langLabel]) => (
                                  <Textarea
                                    key={lang}
                                    id={`option-${option.uid}-field-${fieldIndex}-${lang}`}
                                    label={langLabel}
                                    rows={2}
                                    value={field[lang]}
                                    placeholder={lang === "en" ? "" : "Optional translation"}
                                    onChange={(event) =>
                                      updateField(option.uid, fieldIndex, (current) => ({
                                        ...current,
                                        [lang]: event.target.value
                                      }))
                                    }
                                  />
                                ))}
                              </div>
                            ) : null}

                            {field.kind === "number" ? (
                              <Input
                                id={`option-${option.uid}-field-${fieldIndex}`}
                                label=""
                                aria-label={humanizeMetaKey(field.key) || "Detail value"}
                                type="number"
                                value={field.numberRaw}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  const parsed = Number(raw);
                                  updateField(option.uid, fieldIndex, (current) => ({
                                    ...current,
                                    numberRaw: raw,
                                    numberValue:
                                      raw.trim() !== "" && Number.isFinite(parsed)
                                        ? parsed
                                        : current.numberValue
                                  }));
                                }}
                              />
                            ) : null}

                            {field.kind === "boolean" ? (
                              <label className="option-builder__boolean">
                                <input
                                  type="checkbox"
                                  checked={field.checked}
                                  onChange={(event) =>
                                    updateField(option.uid, fieldIndex, (current) => ({
                                      ...current,
                                      checked: event.target.checked
                                    }))
                                  }
                                />
                                <span>{field.checked ? "Yes" : "No"}</span>
                              </label>
                            ) : null}

                            {field.kind === "json" ? (
                              <>
                                <Textarea
                                  id={`option-${option.uid}-field-${fieldIndex}`}
                                  label=""
                                  aria-label={humanizeMetaKey(field.key) || "Detail value"}
                                  rows={4}
                                  className="option-builder__json"
                                  value={field.jsonRaw}
                                  onChange={(event) => {
                                    const raw = event.target.value;
                                    let jsonValid = false;
                                    let jsonValue: unknown;
                                    try {
                                      jsonValue = JSON.parse(raw);
                                      jsonValid = true;
                                    } catch {
                                      jsonValid = false;
                                    }
                                    updateField(option.uid, fieldIndex, (current) => ({
                                      ...current,
                                      jsonRaw: raw,
                                      jsonValid,
                                      jsonValue: jsonValid ? jsonValue : current.jsonValue
                                    }));
                                  }}
                                />
                                {!field.jsonValid ? (
                                  <span className="option-builder__json-error">
                                    This structured detail is not valid JSON yet - fix it before
                                    saving.
                                  </span>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="option-builder__add-field">
                      <Select
                        id={`option-${option.uid}-new-field-kind`}
                        label="Add another detail"
                        value=""
                        placeholder="Choose a detail type..."
                        options={NEW_FIELD_KINDS.map((kind) => ({
                          value: kind.value,
                          label: kind.label
                        }))}
                        onChange={(value) => {
                          if (!value) return;
                          updateOption(option.uid, (current) => ({
                            ...current,
                            metadata: [...current.metadata, emptyMetaField(value as MetaFieldKind)]
                          }));
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
