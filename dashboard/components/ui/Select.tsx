import type { SelectHTMLAttributes } from "react";

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  options: Array<SelectOption>;
  hint?: string;
};

export function Select({ id, label, options, hint, className, ...props }: SelectProps) {
  const computedClassName = ["ui-select", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className="ui-select-field">
      <label className="ui-select-field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className={computedClassName} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="ui-select-field__hint">{hint}</p> : null}
    </div>
  );
}
