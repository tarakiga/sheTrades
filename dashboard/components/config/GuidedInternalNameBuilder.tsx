"use client";

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
  slugHint
}: GuidedInternalNameBuilderProps) {
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
          <label className="guided-key-builder__segment-label" htmlFor="config-editor-slug">
            {slugLabel}
          </label>
          <input
            id="config-editor-slug"
            className="ui-input"
            value={slugValue}
            onChange={(event) => onSlugChange(event.target.value)}
            placeholder={slugPlaceholder}
            spellCheck={false}
          />
          {slugHint ? <p className="guided-key-builder__slug-hint">{slugHint}</p> : null}
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
