"use client";

export type ColorFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
  hint?: string;
};

/**
 * A colour input presented as a proper swatch card: large clickable swatch,
 * field label, and the live hex readout. Wraps the native colour picker so
 * keyboard and assistive-tech behaviour stay stock.
 */
export function ColorField({ id, label, value, onChange, hint }: ColorFieldProps) {
  return (
    <div className="ui-color-field">
      {/* The visible swatch is OUR div painted with the value - native color
          inputs render their internal swatch with browser-specific padding,
          which made three identical fields look unevenly padded. The real
          input sits invisibly on top so the picker, keyboard access, and
          focus behaviour stay native. */}
      <span className="ui-color-field__swatch-shell">
        <span
          className="ui-color-field__swatch-fill"
          style={{ background: value }}
          aria-hidden="true"
        />
        <input
          id={id}
          type="color"
          className="ui-color-field__swatch"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
      <div className="ui-color-field__meta">
        <label className="ui-color-field__label" htmlFor={id}>
          {label}
        </label>
        <span className="ui-color-field__value">{value}</span>
      </div>
      {hint ? <p className="ui-color-field__hint">{hint}</p> : null}
    </div>
  );
}
