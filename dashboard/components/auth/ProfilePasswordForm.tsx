"use client";

import { Button, Card } from "../ui";
import type { AuthStatusMessage } from "./types";
import { AuthStatusBanner } from "./AuthStatusBanner";
import { PasswordField } from "./PasswordField";

export type ProfilePasswordFormValue = {
  currentPassword: string;
  newPassword: string;
};

export type ProfilePasswordFormProps = {
  title: string;
  description: string;
  currentPasswordLabel: string;
  currentPasswordHint?: string;
  newPasswordLabel: string;
  newPasswordHint?: string;
  saveLabel: string;
  loadingLabel: string;
  value: ProfilePasswordFormValue;
  errors: Partial<Record<keyof ProfilePasswordFormValue, string>>;
  status: AuthStatusMessage | null;
  saving?: boolean;
  onChange: (value: ProfilePasswordFormValue) => void;
  onSubmit: () => void;
};

export function ProfilePasswordForm({
  title,
  description,
  currentPasswordLabel,
  currentPasswordHint,
  newPasswordLabel,
  newPasswordHint,
  saveLabel,
  loadingLabel,
  value,
  errors,
  status,
  saving = false,
  onChange,
  onSubmit
}: ProfilePasswordFormProps) {
  const withHint = (hint?: string) => (hint ? { hint } : {});
  const withError = (error?: string) => (error ? { error } : {});

  return (
    <Card title={title} description={description}>
      <div className="profile-form">
        <AuthStatusBanner message={status} />
        <PasswordField
          id="profile-current-password"
          label={currentPasswordLabel}
          value={value.currentPassword}
          autoComplete="current-password"
          {...withHint(currentPasswordHint)}
          {...withError(errors.currentPassword)}
          onChange={(nextValue) => onChange({ ...value, currentPassword: nextValue })}
        />
        <PasswordField
          id="profile-new-password"
          label={newPasswordLabel}
          value={value.newPassword}
          autoComplete="new-password"
          {...withHint(newPasswordHint)}
          {...withError(errors.newPassword)}
          onChange={(nextValue) => onChange({ ...value, newPassword: nextValue })}
        />
        <div className="profile-form__actions">
          <Button onClick={onSubmit} loading={saving}>
            {saving ? loadingLabel : saveLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
