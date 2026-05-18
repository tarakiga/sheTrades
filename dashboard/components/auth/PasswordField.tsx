"use client";

import { useState } from "react";

export type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  autoComplete
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="auth-password-field">
      <label className="ui-input-field__label" htmlFor={id}>
        {label}
      </label>
      <div
        className={`auth-password-field__control ${error ? "auth-password-field__control--error" : ""}`}
        suppressHydrationWarning
      >
        <input
          id={id}
          className="auth-password-field__input"
          type={revealed ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          suppressHydrationWarning
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="auth-password-field__toggle"
          aria-label={revealed ? "Hide password" : "Show password"}
          onClick={() => setRevealed((current) => !current)}
          suppressHydrationWarning
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <p className="ui-input-field__error">{error}</p> : null}
      {!error && hint ? <p className="ui-input-field__hint">{hint}</p> : null}
    </div>
  );
}
