import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Input({ id, label, hint, error, className, ...props }: InputProps) {
  const computedClassName = ["ui-input", error ? "ui-input--error" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-input-field" suppressHydrationWarning>
      <label className="ui-input-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={computedClassName}
        aria-invalid={Boolean(error)}
        suppressHydrationWarning
        {...props}
      />
      {error ? <p className="ui-input-field__error" suppressHydrationWarning>{error}</p> : null}
      {!error && hint ? <p className="ui-input-field__hint" suppressHydrationWarning>{hint}</p> : null}
    </div>
  );
}
