import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Textarea({
  id,
  label,
  hint,
  error,
  className,
  rows = 10,
  ...props
}: TextareaProps) {
  const computedClassName = ["ui-textarea", error ? "ui-textarea--error" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-input-field">
      <label className="ui-input-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className={computedClassName}
        aria-invalid={Boolean(error)}
        suppressHydrationWarning
        {...props}
      />
      {error ? <p className="ui-input-field__error">{error}</p> : null}
      {!error && hint ? <p className="ui-input-field__hint">{hint}</p> : null}
    </div>
  );
}
