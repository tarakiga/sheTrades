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
  density?: "default" | "compact";
  emailLabel: string;
  emailHint?: string;
  passwordLabel: string;
  passwordHint?: string;
  submitLabel: string;
  loadingLabel: string;
  submitHint?: string;
  forgotPasswordAction?: ReactNode;
  recoveryAction?: ReactNode;
  value: LoginFormValue;
  errors: Partial<Record<keyof LoginFormValue, string>>;
  status: AuthStatusMessage | null;
  submitting?: boolean;
  onChange: (value: LoginFormValue) => void;
  onSubmit: () => void;
};

export function LoginFormCard({
  density = "default",
  emailLabel,
  emailHint,
  passwordLabel,
  passwordHint,
  submitLabel,
  loadingLabel,
  submitHint,
  forgotPasswordAction,
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
      suppressHydrationWarning
    >
      <div className="auth-login-card__content" suppressHydrationWarning>
        <form
          className="profile-form auth-login-card__form"
          suppressHydrationWarning
          onSubmit={(event) => {
            event.preventDefault();
            if (!submitting) onSubmit();
          }}
        >
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
          {forgotPasswordAction ? (
            <div className="auth-login-card__forgot-password">{forgotPasswordAction}</div>
          ) : null}
          <div className="auth-login-card__cta">
            <Button type="submit" loading={submitting} fullWidth size="lg">
              {submitting ? loadingLabel : submitLabel}
            </Button>
            {submitHint ? <p className="auth-login-card__submit-hint">{submitHint}</p> : null}
          </div>
        </form>
      </div>
      {recoveryAction ? (
        <footer className="auth-login-card__footer" suppressHydrationWarning>
          <hr className="auth-login-card__divider" />
          <div className="auth-login-card__recovery">{recoveryAction}</div>
        </footer>
      ) : null}
    </section>
  );
}
