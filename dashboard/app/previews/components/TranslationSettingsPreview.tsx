"use client";

import { useState } from "react";
import { Badge, Button, Card } from "../../../components/ui";
import {
  TranslationSettingsForm,
  createEmptyTranslationForm,
  type TranslationFormState
} from "../../../components/integration/translation/TranslationSettingsForm";

type ConnectionStatus = "idle" | "healthy" | "degraded" | "failed";

function resultVariant(status: ConnectionStatus) {
  switch (status) {
    case "healthy":
      return "success" as const;
    case "degraded":
      return "warning" as const;
    case "failed":
      return "danger" as const;
    default:
      return "info" as const;
  }
}

function resultMessage(status: ConnectionStatus) {
  switch (status) {
    case "healthy":
      return "Translation connection test succeeded.";
    case "degraded":
      return "Translation connection responded with warnings.";
    case "failed":
      return "Translation connection test failed.";
    default:
      return "Not tested yet.";
  }
}

function nextStatus(current: ConnectionStatus): ConnectionStatus {
  if (current === "healthy") return "degraded";
  if (current === "degraded") return "failed";
  return "healthy";
}

/**
 * Default harness: Gemini for both languages (the schema default). Includes
 * a local "Test Connection" button that cycles through the same
 * healthy/degraded/failed states the real workspace renders after calling
 * POST /api/integrations/admin/translation/test - this preview has no admin
 * token, so it simulates the result instead of hitting the live endpoint.
 */
function DefaultHarness() {
  const [form, setForm] = useState<TranslationFormState>(() => createEmptyTranslationForm());
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  function updateField(field: keyof TranslationFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="preview-card-content">
      <TranslationSettingsForm value={form} errors={{}} onChange={updateField} />
      <div className="preview-row">
        <Button variant="secondary" onClick={() => setStatus((current) => nextStatus(current))}>
          Test Connection
        </Button>
        <Badge variant={resultVariant(status)}>{resultMessage(status)}</Badge>
      </div>
    </div>
  );
}

/** Igbo routed through the dedicated Igbo API; Pidgin still Gemini/Anthropic only. */
function IgboApiHarness() {
  const [form, setForm] = useState<TranslationFormState>(() => ({
    ...createEmptyTranslationForm(),
    igProvider: "igbo_api",
    igboApiKey: "nkw_live_ab12cd34"
  }));

  function updateField(field: keyof TranslationFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="preview-card-content">
      <TranslationSettingsForm value={form} errors={{}} onChange={updateField} />
    </div>
  );
}

/** Field-level validation errors, matching the Payouts credential-field pattern. */
function ErrorStateHarness() {
  const [form, setForm] = useState<TranslationFormState>(() => ({
    ...createEmptyTranslationForm(),
    title: "",
    igboApiDailyRequestLimit: "0"
  }));

  function updateField(field: keyof TranslationFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="preview-card-content">
      <TranslationSettingsForm
        value={form}
        errors={{
          title: "Give this translation integration a clear title.",
          geminiApiKey: "Add the Gemini API key.",
          igboApiDailyRequestLimit: "Enter a whole number of at least 1."
        }}
        onChange={updateField}
      />
    </div>
  );
}

export function TranslationSettingsPreview() {
  return (
    <div className="preview-card-content">
      <Card
        title="Default - Gemini for both languages"
        description="The Pidgin select only ever offers Gemini/Anthropic - Igbo API is never in that list because it cannot produce Pidgin. Test Connection cycles the badge through healthy/degraded/failed."
      >
        <DefaultHarness />
      </Card>

      <Card
        title="Igbo routed through Igbo API"
        description="Igbo provider set to the dedicated Igbo API service; the Pidgin provider is unaffected and still restricted to the two LLM options."
      >
        <IgboApiHarness />
      </Card>

      <Card
        title="Field-level error states"
        description="Validation errors render beneath each field, matching the existing Payouts credential-field pattern."
      >
        <ErrorStateHarness />
      </Card>
    </div>
  );
}
