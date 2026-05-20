"use client";

import type { ReactNode } from "react";
import { Button, Input } from "../ui";
import type { AuthStatusMessage } from "./types";
import { AuthStatusBanner } from "./AuthStatusBanner";
import { PasswordField } from "./PasswordField";

export type LoginFormValue = {
  email: string;
  password: string;
};

export type LoginFormCardProps = {
  eyebrow?: string;
  title: string;
  description: string;
  density?: "default" | "compact";
  emailLabel: string;
  emailHint?: string;
  passwordLabel: string;
  passwordHint?: string;
  submitLabel: string;
  loadingLabel: string;
  submitHint?: string;
  recoveryAction?: ReactNode;
  value: LoginFormValue;
  errors: Partial<Record<keyof LoginFormValue, string>>;
  status: AuthStatusMessage | null;
  submitting?: boolean;
  onChange: (value: LoginFormValue) => void;
  onSubmit: () => void;
};

export function LoginFormCard({
  eyebrow,
  title,
  description,
  density = "default",
  emailLabel,
  emailHint,
  passwordLabel,
  passwordHint,
  submitLabel,
  loadingLabel,
  submitHint,
  recoveryAction,
  value,
  errors,
  status,
  submitting = false,
  onChange,
  onSubmit
}: LoginFormCardProps) {
  const withHint = (hint?: string) => (hint ? { hint } : {});
  const withError = (error?: string) => (error ? { error } : {});

  return (
    <section
      className={[
        "ui-card",
        "auth-login-card",
        density === "compact" ? "auth-login-card--compact" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="auth-login-card__header">
        {eyebrow ? <p className="auth-login-card__eyebrow">{eyebrow}</p> : null}
        <div>
          <h3 className="auth-login-card__title">{title}</h3>
          <p className="auth-login-card__description">{description}</p>
        </div>
      </header>
      <div className="auth-login-card__content">
        <div className="profile-form auth-login-card__form">
          <AuthStatusBanner message={status} />
          <Input
            id="login-email"
            label={emailLabel}
            type="email"
            autoComplete="email"
            value={value.email}
            {...withHint(emailHint)}
            {...withError(errors.email)}
            onChange={(event) => onChange({ ...value, email: event.target.value })}
          />
          <PasswordField
            id="login-password"
            label={passwordLabel}
            value={value.password}
            autoComplete="current-password"
            {...withHint(passwordHint)}
            {...withError(errors.password)}
            onChange={(nextValue) => onChange({ ...value, password: nextValue })}
          />
          <div className="auth-login-card__cta">
            <Button onClick={onSubmit} loading={submitting} fullWidth size="lg">
              {submitting ? loadingLabel : submitLabel}
            </Button>
            {submitHint ? <p className="auth-login-card__submit-hint">{submitHint}</p> : null}
          </div>
          {recoveryAction ? <div className="auth-login-card__recovery">{recoveryAction}</div> : null}
        </div>
      </div>
    </section>
  );
}
