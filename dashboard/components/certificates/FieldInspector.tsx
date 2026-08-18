"use client";

import { Button, ColorField, Input, Select, Textarea } from "../ui";
import {
  VARIABLE_LABELS,
  isImageField,
  type Align,
  type CertificateAsset,
  type TemplateField
} from "../../lib/admin/certificate-template";

export type FieldInspectorProps = {
  field: TemplateField | null;
  /** Uploaded artwork, for a logo field's picker. */
  assets: CertificateAsset[];
  onChange: (patch: Partial<TemplateField>) => void;
  onRemove: () => void;
  /** Fired when an edit is finished rather than on every keystroke, so the
   * server preview is not re-rendered per character. */
  onCommit: () => void;
};

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" }
];

const WEIGHT_OPTIONS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "700", label: "Bold" },
  { value: "900", label: "Black" }
];

const DATE_FORMAT_OPTIONS = [
  { value: "long-ordinal", label: "August 18th, 2026" },
  { value: "iso", label: "2026-08-18" }
];

/**
 * The properties of whichever field is selected.
 *
 * Each variant shows ONLY the controls it actually has. A `format` control on a
 * certificate number, or a line-height on a learner's name, would parse happily
 * into the payload and then be discarded by the schema — config that looks like
 * it does something and does not, which is the class of bug an admin has no way
 * to diagnose. The contract splits those branches for the same reason; this
 * mirrors it.
 *
 * Percentages, not fractions, in the UI. The template stores 0..1 because that
 * is what makes a layout resolution-independent, but nobody thinks in "0.0566"
 * — they think "5.7% of the height".
 */
export function FieldInspector({ field, assets, onChange, onRemove, onCommit }: FieldInspectorProps) {
  if (!field) {
    return (
      <div className="field-inspector field-inspector--empty">
        <p className="field-inspector__empty-title">Nothing selected</p>
        <p className="field-inspector__empty-body">
          Click a box on the certificate to move it or change how it looks.
        </p>
      </div>
    );
  }

  const image = isImageField(field);
  const logoOptions = assets
    .filter((asset) => asset.kind === "logo")
    .map((asset) => ({ value: asset.key, label: `${asset.key} (${asset.width}×${asset.height})` }));

  return (
    <div className="field-inspector">
      <header className="field-inspector__header">
        <div>
          <h3 className="field-inspector__title">{VARIABLE_LABELS[field.variable]}</h3>
          <p className="field-inspector__id">{field.id}</p>
        </div>
        <Button variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </header>

      <div className="field-inspector__grid">
        <PercentInput
          id="field-x"
          label="Across"
          value={field.x}
          onChange={(x) => onChange({ x } as Partial<TemplateField>)}
          onCommit={onCommit}
        />
        <PercentInput
          id="field-y"
          label={image ? "Down (top edge)" : "Down (baseline)"}
          value={field.y}
          onChange={(y) => onChange({ y } as Partial<TemplateField>)}
          onCommit={onCommit}
        />
        <Select
          id="field-align"
          label="Anchored"
          value={field.align}
          options={ALIGN_OPTIONS}
          onChange={(align) => {
            onChange({ align: align as Align } as Partial<TemplateField>);
            onCommit();
          }}
        />
      </div>

      {image ? (
        <div className="field-inspector__grid">
          <PercentInput
            id="field-width"
            label="Width"
            value={field.width}
            onChange={(width) => onChange({ width } as Partial<TemplateField>)}
            onCommit={onCommit}
            hint="Height follows the artwork's own proportions, so it cannot be stretched."
          />
          <PercentInput
            id="field-opacity"
            label="Opacity"
            value={field.opacity}
            onChange={(opacity) => onChange({ opacity } as Partial<TemplateField>)}
            onCommit={onCommit}
          />
          {field.variable === "logo" ? (
            <Select
              id="field-asset"
              label="Artwork"
              value={field.assetKey ?? ""}
              options={logoOptions}
              emptyMessage="No logos have been uploaded yet."
              onChange={(assetKey) => {
                onChange({ assetKey } as Partial<TemplateField>);
                onCommit();
              }}
            />
          ) : null}
        </div>
      ) : (
        <>
          <div className="field-inspector__grid">
            <PercentInput
              id="field-size"
              label="Text size"
              value={field.size}
              onChange={(size) => onChange({ size } as Partial<TemplateField>)}
              onCommit={onCommit}
              hint="As a share of the certificate's height."
            />
            <PercentInput
              id="field-max-width"
              label="Room to use"
              value={field.maxWidth}
              onChange={(maxWidth) => onChange({ maxWidth } as Partial<TemplateField>)}
              onCommit={onCommit}
              hint="The dashed box on the canvas."
            />
            <Select
              id="field-weight"
              label="Weight"
              value={String(field.weight)}
              options={WEIGHT_OPTIONS}
              onChange={(weight) => {
                onChange({ weight: Number(weight) } as Partial<TemplateField>);
                onCommit();
              }}
            />
          </div>

          <div className="field-inspector__grid">
            <Input
              id="field-font"
              label="Typeface"
              value={field.font}
              hint="Must be installed in the renderer; Roboto and DejaVu Sans are."
              onChange={(event) => onChange({ font: event.target.value } as Partial<TemplateField>)}
              onBlur={onCommit}
            />
            <ColorField
              id="field-color"
              label="Colour"
              value={field.color}
              onChange={(color) => {
                onChange({ color } as Partial<TemplateField>);
                onCommit();
              }}
            />
            <label className="field-inspector__checkbox">
              <input
                type="checkbox"
                checked={field.autoShrink}
                onChange={(event) => {
                  onChange({ autoShrink: event.target.checked } as Partial<TemplateField>);
                  onCommit();
                }}
              />
              <span>
                Shrink to fit
                <em>
                  Long names step down in size rather than running off the artwork. Leave off for a
                  reference number, which must stay readable at a fixed size.
                </em>
              </span>
            </label>
          </div>

          {field.variable === "issuedDate" ? (
            <Select
              id="field-date-format"
              label="Date style"
              value={field.format}
              options={DATE_FORMAT_OPTIONS}
              onChange={(format) => {
                onChange({ format } as Partial<TemplateField>);
                onCommit();
              }}
            />
          ) : null}

          {field.variable === "bodyText" ? (
            <div className="field-inspector__stack">
              <Textarea
                id="field-text"
                label="The sentence"
                rows={3}
                value={field.text}
                hint="Wrap a phrase in **double asterisks** to set it in bold."
                onChange={(event) => onChange({ text: event.target.value } as Partial<TemplateField>)}
                onBlur={onCommit}
              />
              <div className="field-inspector__grid">
                <NumberInput
                  id="field-line-height"
                  label="Line spacing"
                  value={field.lineHeight}
                  step={0.05}
                  min={1}
                  max={3}
                  onChange={(lineHeight) => onChange({ lineHeight } as Partial<TemplateField>)}
                  onCommit={onCommit}
                />
                <NumberInput
                  id="field-max-lines"
                  label="Most lines allowed"
                  value={field.maxLines}
                  step={1}
                  min={1}
                  max={12}
                  onChange={(maxLines) => onChange({ maxLines } as Partial<TemplateField>)}
                  onCommit={onCommit}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** A 0..1 value edited as a percentage. Stored rounded so the payload stays
 * readable to whoever has to diff two versions of it. */
function PercentInput({
  id,
  label,
  value,
  hint,
  onChange,
  onCommit
}: {
  id: string;
  label: string;
  value: number;
  hint?: string;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <Input
      id={id}
      label={`${label} (%)`}
      type="number"
      step={0.1}
      min={0}
      max={100}
      value={Number((value * 100).toFixed(2))}
      {...(hint ? { hint } : {})}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (!Number.isFinite(next)) return;
        onChange(Math.min(1, Math.max(0, Math.round(next * 100) / 10_000)));
      }}
      onBlur={onCommit}
    />
  );
}

function NumberInput({
  id,
  label,
  value,
  step,
  min,
  max,
  onChange,
  onCommit
}: {
  id: string;
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <Input
      id={id}
      label={label}
      type="number"
      step={step}
      min={min}
      max={max}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (!Number.isFinite(next)) return;
        onChange(Math.min(max, Math.max(min, next)));
      }}
      onBlur={onCommit}
    />
  );
}
