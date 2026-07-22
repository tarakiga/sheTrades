"use client";

import { useState } from "react";
import { Button, Input, Select, Textarea } from "../../ui";

export type TranslationPidginProviderKey = "gemini" | "anthropic";
export type TranslationIgboProviderKey = "igbo_api" | "gemini" | "anthropic";

export type TranslationFormState = {
  title: string;
  enabled: boolean;
  pcmProvider: TranslationPidginProviderKey;
  igProvider: TranslationIgboProviderKey;
  igboApiKey: string;
  igboApiBaseUrl: string;
  igboApiDailyRequestLimit: string;
  geminiApiKey: string;
  geminiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  notes: string;
};

export const DEFAULT_TRANSLATION_TITLE = "Primary Translation Integration";

export function createEmptyTranslationForm(): TranslationFormState {
  return {
    title: DEFAULT_TRANSLATION_TITLE,
    enabled: true,
    pcmProvider: "gemini",
    igProvider: "gemini",
    igboApiKey: "",
    igboApiBaseUrl: "https://igboapi.com",
    igboApiDailyRequestLimit: "2500",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    anthropicApiKey: "",
    anthropicModel: "claude-sonnet-5",
    notes: ""
  };
}

// Domain rule: the Igbo API is eng<->ibo only (Google never shipped Pidgin to
// Cloud Translation, and Nkọwa okwu only covers Igbo), so it can never
// produce Pidgin. It is therefore never offered as a Pidgin provider option,
// rather than being offered and rejected server-side.
//
// Anthropic is intentionally NOT offered yet: the backend adapter is a
// documented stub (see backend/src/translation/providers/llm.ts). Offering it
// would let an admin pick a dead end whose failure surfaces a developer-facing
// message. Gemini covers both languages. Re-add these entries once the
// Anthropic adapter is implemented — the type and backend already allow it.
const PCM_PROVIDER_OPTIONS: Array<{ value: TranslationPidginProviderKey; label: string }> = [
  { value: "gemini", label: "Gemini" }
];

const IG_PROVIDER_OPTIONS: Array<{ value: TranslationIgboProviderKey; label: string }> = [
  { value: "igbo_api", label: "Igbo API" },
  { value: "gemini", label: "Gemini" }
];

export type TranslationSettingsFormProps = {
  value: TranslationFormState;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (field: keyof TranslationFormState, value: string | boolean) => void;
};

type SecretFieldProps = {
  id: string;
  label: string;
  value: string;
  hint: string;
  error?: string | undefined;
  disabled?: boolean;
  onChange: (value: string) => void;
};

// Mirrors the SecretField helper in IntegrationConfigDrawer.tsx: a shared
// Input in password mode plus a reveal toggle, rather than a bespoke input
// element, so this stays on the design-token / component-library path.
function SecretField({ id, label, value, hint, error, disabled, onChange }: SecretFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const withError = error ? { error } : {};

  return (
    <div className="integration-config-drawer__secret-field">
      <Input
        id={id}
        label={label}
        type={revealed ? "text" : "password"}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        hint={hint}
        {...withError}
      />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        disabled={disabled}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? "Hide" : "Reveal"}
      </Button>
    </div>
  );
}

/**
 * Pure, presentational translation settings form. Deliberately has no fetch
 * logic of its own (see IntegrationTranslationWorkspace for that) so it can
 * be reused verbatim inside the /previews/components harness, which has no
 * admin token to load real data with.
 */
export function TranslationSettingsForm({
  value,
  errors,
  disabled = false,
  onChange
}: TranslationSettingsFormProps) {
  const withError = (error?: string) => (error ? { error } : {});

  return (
    <div className="integration-config-drawer">
      <div className="integration-config-drawer__grid">
        <Input
          id="translation-title"
          label="Integration Title"
          value={value.title}
          disabled={disabled}
          onChange={(event) => onChange("title", event.target.value)}
          hint="Use a clear operational name so admins know which connection is active."
          {...withError(errors.title)}
        />
        <Select
          id="translation-enabled"
          label="Status"
          value={value.enabled ? "enabled" : "disabled"}
          disabled={disabled}
          options={[
            { value: "enabled", label: "Enabled" },
            { value: "disabled", label: "Disabled" }
          ]}
          onChange={(next) => onChange("enabled", next === "enabled")}
          hint="Disabled integrations keep their configuration but do not run translations."
        />
        <Select
          id="translation-pcm-provider"
          label="Provider For Pidgin"
          value={value.pcmProvider}
          disabled={disabled}
          options={PCM_PROVIDER_OPTIONS}
          onChange={(next) => onChange("pcmProvider", next as TranslationPidginProviderKey)}
          hint="The Igbo API cannot produce Pidgin, so only the LLM providers are offered here."
        />
        <Select
          id="translation-ig-provider"
          label="Provider For Igbo"
          value={value.igProvider}
          disabled={disabled}
          options={IG_PROVIDER_OPTIONS}
          onChange={(next) => onChange("igProvider", next as TranslationIgboProviderKey)}
          hint="Igbo API is a dedicated eng<->ibo translation service; Gemini is the LLM alternative."
        />
      </div>

      <div className="integration-config-drawer__grid">
        <Input
          id="translation-igboapi-base-url"
          label="Igbo API Base URL"
          value={value.igboApiBaseUrl}
          disabled={disabled}
          onChange={(event) => onChange("igboApiBaseUrl", event.target.value)}
          hint="Defaults to https://igboapi.com."
          {...withError(errors.igboApiBaseUrl)}
        />
        <Input
          id="translation-igboapi-daily-limit"
          label="Igbo API Daily Request Limit"
          type="number"
          min={1}
          value={value.igboApiDailyRequestLimit}
          disabled={disabled}
          onChange={(event) => onChange("igboApiDailyRequestLimit", event.target.value)}
          hint="Nkọwa okwu document 2,500 requests/day; some keys report lower. Set this to your key's real limit so the runner paces itself instead of collecting 429s."
          {...withError(errors.igboApiDailyRequestLimit)}
        />
        <SecretField
          id="translation-igboapi-api-key"
          label="Igbo API Key"
          value={value.igboApiKey}
          disabled={disabled}
          onChange={(next) => onChange("igboApiKey", next)}
          hint="Used only when Igbo API is selected as a provider above."
          {...withError(errors.igboApiKey)}
        />
      </div>

      <div className="integration-config-drawer__grid">
        <Input
          id="translation-gemini-model"
          label="Gemini Model"
          value={value.geminiModel}
          disabled={disabled}
          onChange={(event) => onChange("geminiModel", event.target.value)}
          hint="Defaults to gemini-2.5-flash."
          {...withError(errors.geminiModel)}
        />
        <SecretField
          id="translation-gemini-api-key"
          label="Gemini API Key"
          value={value.geminiApiKey}
          disabled={disabled}
          onChange={(next) => onChange("geminiApiKey", next)}
          hint="Used only when Gemini is selected as a provider above."
          {...withError(errors.geminiApiKey)}
        />
      </div>
      {/*
        Anthropic credential fields are intentionally not rendered: Anthropic is
        not offered as a provider yet (its backend adapter is a stub), so there
        is nothing to configure. The form state still carries anthropic defaults
        so the saved payload stays schema-valid; re-add these inputs when the
        Anthropic adapter ships.
      */}

      <Textarea
        id="translation-notes"
        label="Operational Notes"
        value={value.notes}
        disabled={disabled}
        onChange={(event) => onChange("notes", event.target.value)}
        rows={5}
        hint="Use this space for admin-facing context such as key ownership or rate-limit history."
      />
    </div>
  );
}
