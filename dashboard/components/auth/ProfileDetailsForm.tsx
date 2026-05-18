"use client";

import { Button, Card, Input } from "../ui";
import type { AuthStatusMessage } from "./types";
import { AuthStatusBanner } from "./AuthStatusBanner";

export type ProfileDetailsFormValue = {
  fullName: string;
  avatarUrl: string;
};

export type ProfileDetailsFormProps = {
  title: string;
  description: string;
  fullNameLabel: string;
  fullNameHint?: string;
  avatarUrlLabel: string;
  avatarUrlHint?: string;
  saveLabel: string;
  loadingLabel: string;
  value: ProfileDetailsFormValue;
  errors: Partial<Record<keyof ProfileDetailsFormValue, string>>;
  status: AuthStatusMessage | null;
  saving?: boolean;
  onChange: (value: ProfileDetailsFormValue) => void;
  onSubmit: () => void;
};

export function ProfileDetailsForm({
  title,
  description,
  fullNameLabel,
  fullNameHint,
  avatarUrlLabel,
  avatarUrlHint,
  saveLabel,
  loadingLabel,
  value,
  errors,
  status,
  saving = false,
  onChange,
  onSubmit
}: ProfileDetailsFormProps) {
  const withHint = (hint?: string) => (hint ? { hint } : {});
  const withError = (error?: string) => (error ? { error } : {});

  return (
    <Card title={title} description={description}>
      <div className="profile-form">
        <AuthStatusBanner message={status} />
        <Input
          id="profile-full-name"
          label={fullNameLabel}
          value={value.fullName}
          {...withHint(fullNameHint)}
          {...withError(errors.fullName)}
          onChange={(event) => onChange({ ...value, fullName: event.target.value })}
        />
        <Input
          id="profile-avatar-url"
          label={avatarUrlLabel}
          value={value.avatarUrl}
          {...withHint(avatarUrlHint)}
          {...withError(errors.avatarUrl)}
          onChange={(event) => onChange({ ...value, avatarUrl: event.target.value })}
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
