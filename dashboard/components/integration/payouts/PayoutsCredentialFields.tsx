"use client";

import { useState } from "react";
import type { ProviderKey } from "./PayoutsProviderSelector";

export type PayoutsDefaults = {
  currency: "NGN";
  channel: "airtime";
};

export type AfricasTalkingCredentials = {
  username: string;
  apiKey: string;
};

export type TermiiCredentials = {
  apiKey: string;
  senderId?: string | undefined;
};

export type ReloadlyCredentials = {
  clientId: string;
  clientSecret: string;
};

export type PayoutsIntegrationPayload =
  | {
      provider: "africas_talking";
      sandbox: boolean;
      africasTalking: AfricasTalkingCredentials;
      defaults: PayoutsDefaults;
    }
  | {
      provider: "termii";
      sandbox: boolean;
      termii: TermiiCredentials;
      defaults: PayoutsDefaults;
    }
  | {
      provider: "reloadly";
      sandbox: boolean;
      reloadly: ReloadlyCredentials;
      defaults: PayoutsDefaults;
    };

export type PayoutsCredentialFieldsProps = {
  provider: ProviderKey;
  value: PayoutsIntegrationPayload;
  onChange: (next: PayoutsIntegrationPayload) => void;
  errors: Partial<Record<string, string>>;
};

type FieldRowProps = {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
};

function FieldRow({ id, label, hint, error, children }: FieldRowProps) {
  const describedBy = error
    ? `${id}-error`
    : hint
      ? `${id}-hint`
      : undefined;
  return (
    <div className="payouts-credential-fields__field">
      <label
        className="payouts-credential-fields__label"
        htmlFor={id}
      >
        {label}
      </label>
      <div
        className="payouts-credential-fields__control"
        data-described-by={describedBy ?? ""}
      >
        {children}
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          className="payouts-credential-fields__error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p id={`${id}-hint`} className="payouts-credential-fields__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type SecretInputProps = {
  id: string;
  value: string;
  placeholder?: string;
  hasError: boolean;
  describedBy: string | undefined;
  onChange: (next: string) => void;
};

function SecretInput({
  id,
  value,
  placeholder,
  hasError,
  describedBy,
  onChange
}: SecretInputProps) {
  const [revealed, setRevealed] = useState(false);
  const inputClass = [
    "payouts-credential-fields__input",
    "payouts-credential-fields__input--secret",
    hasError ? "payouts-credential-fields__input--error" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="payouts-credential-fields__secret">
      <input
        id={id}
        className={inputClass}
        type={revealed ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={hasError}
        aria-describedby={describedBy}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="payouts-credential-fields__reveal"
        aria-label={revealed ? "Hide secret" : "Show secret"}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? "Hide" : "Show"}
      </button>
    </div>
  );
}

type TextInputProps = {
  id: string;
  value: string;
  placeholder?: string;
  hasError: boolean;
  describedBy: string | undefined;
  onChange: (next: string) => void;
};

function TextInput({
  id,
  value,
  placeholder,
  hasError,
  describedBy,
  onChange
}: TextInputProps) {
  const inputClass = [
    "payouts-credential-fields__input",
    hasError ? "payouts-credential-fields__input--error" : ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <input
      id={id}
      className={inputClass}
      type="text"
      value={value}
      placeholder={placeholder}
      autoComplete="off"
      aria-invalid={hasError}
      aria-describedby={describedBy}
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function isAfricasTalking(
  value: PayoutsIntegrationPayload
): value is Extract<PayoutsIntegrationPayload, { provider: "africas_talking" }> {
  return value.provider === "africas_talking";
}

function isTermii(
  value: PayoutsIntegrationPayload
): value is Extract<PayoutsIntegrationPayload, { provider: "termii" }> {
  return value.provider === "termii";
}

function isReloadly(
  value: PayoutsIntegrationPayload
): value is Extract<PayoutsIntegrationPayload, { provider: "reloadly" }> {
  return value.provider === "reloadly";
}

export function PayoutsCredentialFields({
  provider,
  value,
  onChange,
  errors
}: PayoutsCredentialFieldsProps) {
  // The selector and the value can briefly disagree while the parent
  // re-derives the payload shape. Render nothing rather than crashing
  // in that transient state.
  if (value.provider !== provider) {
    return null;
  }

  if (isAfricasTalking(value)) {
    return (
      <div className="payouts-credential-fields">
        <FieldRow
          id="payouts-at-username"
          label="API Username"
          hint="Found in your Africa's Talking dashboard under Account → API."
          error={errors.username}
        >
          <TextInput
            id="payouts-at-username"
            value={value.africasTalking.username}
            placeholder="e.g. shetrades_prod"
            hasError={Boolean(errors.username)}
            describedBy={errors.username ? "payouts-at-username-error" : "payouts-at-username-hint"}
            onChange={(next) =>
              onChange({
                ...value,
                africasTalking: { ...value.africasTalking, username: next }
              })
            }
          />
        </FieldRow>
        <FieldRow
          id="payouts-at-api-key"
          label="API Key"
          hint="Generated under Account → API. Treat like a password."
          error={errors.apiKey}
        >
          <SecretInput
            id="payouts-at-api-key"
            value={value.africasTalking.apiKey}
            placeholder="atk_live_..."
            hasError={Boolean(errors.apiKey)}
            describedBy={errors.apiKey ? "payouts-at-api-key-error" : "payouts-at-api-key-hint"}
            onChange={(next) =>
              onChange({
                ...value,
                africasTalking: { ...value.africasTalking, apiKey: next }
              })
            }
          />
        </FieldRow>
      </div>
    );
  }

  if (isTermii(value)) {
    return (
      <div className="payouts-credential-fields">
        <FieldRow
          id="payouts-termii-api-key"
          label="API Key"
          hint="Found in Termii dashboard → API → Keys. Treat like a password."
          error={errors.apiKey}
        >
          <SecretInput
            id="payouts-termii-api-key"
            value={value.termii.apiKey}
            placeholder="TLeAB..."
            hasError={Boolean(errors.apiKey)}
            describedBy={errors.apiKey ? "payouts-termii-api-key-error" : "payouts-termii-api-key-hint"}
            onChange={(next) =>
              onChange({
                ...value,
                termii: { ...value.termii, apiKey: next }
              })
            }
          />
        </FieldRow>
        <FieldRow
          id="payouts-termii-sender-id"
          label="Sender ID (optional)"
          hint="Approved Termii sender ID for SMS receipts. Leave blank to use the workspace default."
          error={errors.senderId}
        >
          <TextInput
            id="payouts-termii-sender-id"
            value={value.termii.senderId ?? ""}
            placeholder="SheTrades"
            hasError={Boolean(errors.senderId)}
            describedBy={errors.senderId ? "payouts-termii-sender-id-error" : "payouts-termii-sender-id-hint"}
            onChange={(next) =>
              onChange({
                ...value,
                termii: {
                  ...value.termii,
                  senderId: next.trim() === "" ? undefined : next
                }
              })
            }
          />
        </FieldRow>
      </div>
    );
  }

  if (isReloadly(value)) {
    return (
      <div className="payouts-credential-fields">
        <FieldRow
          id="payouts-reloadly-client-id"
          label="Client ID"
          hint="From Reloadly Console → API Credentials."
          error={errors.clientId}
        >
          <TextInput
            id="payouts-reloadly-client-id"
            value={value.reloadly.clientId}
            placeholder="e.g. rl_live_8f12..."
            hasError={Boolean(errors.clientId)}
            describedBy={errors.clientId ? "payouts-reloadly-client-id-error" : "payouts-reloadly-client-id-hint"}
            onChange={(next) =>
              onChange({
                ...value,
                reloadly: { ...value.reloadly, clientId: next }
              })
            }
          />
        </FieldRow>
        <FieldRow
          id="payouts-reloadly-client-secret"
          label="Client Secret"
          hint="Used for OAuth client-credentials exchange. Treat like a password."
          error={errors.clientSecret}
        >
          <SecretInput
            id="payouts-reloadly-client-secret"
            value={value.reloadly.clientSecret}
            placeholder="••••••••"
            hasError={Boolean(errors.clientSecret)}
            describedBy={errors.clientSecret ? "payouts-reloadly-client-secret-error" : "payouts-reloadly-client-secret-hint"}
            onChange={(next) =>
              onChange({
                ...value,
                reloadly: { ...value.reloadly, clientSecret: next }
              })
            }
          />
        </FieldRow>
      </div>
    );
  }

  return null;
}

export function createEmptyPayoutsPayload(
  provider: ProviderKey
): PayoutsIntegrationPayload {
  const defaults: PayoutsDefaults = { currency: "NGN", channel: "airtime" };
  if (provider === "africas_talking") {
    return {
      provider: "africas_talking",
      sandbox: false,
      africasTalking: { username: "", apiKey: "" },
      defaults
    };
  }
  if (provider === "termii") {
    return {
      provider: "termii",
      sandbox: false,
      termii: { apiKey: "" },
      defaults
    };
  }
  return {
    provider: "reloadly",
    sandbox: false,
    reloadly: { clientId: "", clientSecret: "" },
    defaults
  };
}
