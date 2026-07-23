"use client";

import { useEffect, useRef } from "react";
import { Select } from "../ui";

type CategoryOption = {
  value: string;
  label: string;
};

type BuilderNotice = {
  tone: "info" | "warning";
  text: string;
};

export type GuidedInternalNameBuilderProps = {
  label: string;
  namespace: string;
  categoryLabel: string;
  categoryValue: string;
  categoryOptions: Array<CategoryOption>;
  categoryPlaceholder: string;
  slugLabel: string;
  slugValue: string;
  slugPlaceholder: string;
  onCategoryChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  helperNote: string;
  examples: Array<string>;
  previewLabel: string;
  previewValue: string;
  notice?: BuilderNotice | null;
  slugHint?: string;
  isLessonMode?: boolean;
  lessonNumberValue?: string;
  onLessonNumberChange?: (value: string) => void;
  automatedSlugPreview?: string;
};

export function GuidedInternalNameBuilder({
  label,
  namespace,
  categoryLabel,
  categoryValue,
  categoryOptions,
  categoryPlaceholder,
  slugLabel,
  slugValue,
  slugPlaceholder,
  onCategoryChange,
  onSlugChange,
  helperNote,
  examples,
  previewLabel,
  previewValue,
  notice,
  slugHint,
  isLessonMode,
  lessonNumberValue,
  onLessonNumberChange,
  automatedSlugPreview
}: GuidedInternalNameBuilderProps) {
  const inputRef = useRef<HTMLDivElement>(null);

  // Sync internal slug state to div value when it changes externally (e.g. templates applied)
  // but only when the user is not actively focusing/typing inside it to avoid cursor jumps.
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      if (inputRef.current.innerText !== slugValue) {
        inputRef.current.innerText = slugValue;
      }
    }
  }, [slugValue]);

  return (
    <section className="guided-key-builder">
      <div className="guided-key-builder__header">
        <label className="guided-key-builder__label">{label}</label>
        <p className="guided-key-builder__helper">{helperNote}</p>
      </div>

      <div className="guided-key-builder__row">
        <div className="guided-key-builder__segment guided-key-builder__segment--namespace">
          <span className="guided-key-builder__segment-label">Section</span>
          <div className="guided-key-builder__namespace" aria-readonly="true">
            {namespace}
          </div>
        </div>

        <div className="guided-key-builder__segment guided-key-builder__segment--category">
          <Select
            id="config-editor-category"
            label={categoryLabel}
            value={categoryValue}
            options={categoryOptions}
            placeholder={categoryPlaceholder}
            emptyMessage="No categories available yet."
            disabled={categoryOptions.length === 0}
            onChange={onCategoryChange}
            className="guided-key-builder__select"
            labelClassName="guided-key-builder__segment-label"
          />
        </div>

        <div className="guided-key-builder__segment guided-key-builder__segment--slug">
          <label className="guided-key-builder__segment-label" htmlFor="config-editor-slug-internal-unique">
            {isLessonMode ? "Lesson Number" : slugLabel}
          </label>
          {isLessonMode ? (
            <>
              <input
                type="number"
                id="config-editor-slug-internal-unique"
                className="ui-input__field"
                value={lessonNumberValue || ""}
                onChange={(e) => onLessonNumberChange && onLessonNumberChange(e.target.value)}
                min={1}
                style={{ height: "var(--control-height-md)", padding: "0 var(--space-3)", width: "100%", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-300)" }}
              />
              {automatedSlugPreview && (
                <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-xs)", color: "var(--color-brand-600)", fontWeight: 500 }}>
                  Auto-Slug: {automatedSlugPreview}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                id="config-editor-slug-internal-unique"
                ref={inputRef}
                contentEditable
                suppressContentEditableWarning
                className="ui-input guided-key-builder__content-editable-input"
                data-placeholder={slugPlaceholder}
                onInput={(event) => onSlugChange(event.currentTarget.innerText || "")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: "var(--control-height-md)",
                  height: "var(--control-height-md)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              />
              {slugHint ? <p className="guided-key-builder__slug-hint">{slugHint}</p> : null}
            </>
          )}
        </div>
      </div>

      {notice ? (
        <div className={`guided-key-builder__notice guided-key-builder__notice--${notice.tone}`}>
          {notice.text}
        </div>
      ) : null}

      <div className="guided-key-builder__examples">
        {examples.map((example) => (
          <div key={example} className="guided-key-builder__example">
            {example}
          </div>
        ))}
      </div>

      <div className="guided-key-builder__preview">
        <span className="guided-key-builder__preview-label">{previewLabel}</span>
        <code className="guided-key-builder__preview-value">
          {previewValue || `${namespace}...`}
        </code>
      </div>
    </section>
  );
}
