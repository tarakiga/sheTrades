"use client";

import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, Input, Select } from "../ui";
import {
  ADMIN_CONFIG_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../lib/admin-config-auth";
import { BRANDING_FALLBACK, FONT_CHOICES } from "../../lib/branding";
import type { IntegrationDocumentDetail } from "../integration/types";

const DOCUMENT_KEY = "branding.identity";
const DOCUMENT_TITLE = "Branding";

type FeedbackState = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type BrandingFormState = {
  organisationName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
};

function createDefaultForm(): BrandingFormState {
  return { ...BRANDING_FALLBACK };
}

function toForm(detail: IntegrationDocumentDetail | null): BrandingFormState {
  const payload = detail?.draft?.payload ?? detail?.published?.payload ?? null;
  if (!payload || typeof payload !== "object") return createDefaultForm();
  const data = payload as Record<string, unknown>;
  const str = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  return {
    organisationName: str(data.organisationName, BRANDING_FALLBACK.organisationName),
    primaryColor: str(data.primaryColor, BRANDING_FALLBACK.primaryColor),
    secondaryColor: str(data.secondaryColor, BRANDING_FALLBACK.secondaryColor),
    accentColor: str(data.accentColor, BRANDING_FALLBACK.accentColor),
    fontFamily: str(data.fontFamily, BRANDING_FALLBACK.fontFamily)
  };
}

function validate(form: BrandingFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.organisationName.trim()) {
    errors.organisationName = "Enter the organisation name shown across the app.";
  }
  if (!form.fontFamily.trim()) {
    errors.fontFamily = "Enter a font family name (e.g. Inter).";
  }
  return errors;
}

export function BrandingWorkspace() {
  const [token, setToken] = useState("");
  const [detail, setDetail] = useState<IntegrationDocumentDetail | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<BrandingFormState>(createDefaultForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function request<T>(path: string, init?: RequestInit, accessToken = token) {
    const response = await fetch(`${ADMIN_CONFIG_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(init?.headers ?? {})
      }
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T & { message?: string });
    if (!response.ok) {
      throw new Error(typeof body.message === "string" ? body.message : "Request failed");
    }
    return body;
  }

  async function refresh(accessToken = token) {
    if (!accessToken) {
      setIsLoading(false);
      setDetail(null);
      setForm(createDefaultForm());
      setLoadError("Save an access key in Integration before managing branding.");
      return;
    }
    try {
      setIsLoading(true);
      setLoadError("");
      const detailResponse = await request<IntegrationDocumentDetail>(
        `/api/config/admin/content/documents/${encodeURIComponent(DOCUMENT_KEY)}`,
        undefined,
        accessToken
      );
      setDetail(detailResponse);
      setForm(toForm(detailResponse));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not found/i.test(message)) {
        // No branding published yet - start from the safe defaults.
        setDetail(null);
        setForm(createDefaultForm());
        setLoadError("");
      } else {
        setLoadError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const existing = getStoredAdminConfigToken();
    setToken(existing);
    void refresh(existing);
    function handleTokenUpdated() {
      const nextToken = getStoredAdminConfigToken();
      setToken(nextToken);
      void refresh(nextToken);
    }
    window.addEventListener(ADMIN_CONFIG_TOKEN_UPDATED_EVENT, handleTokenUpdated);
    return () => {
      window.removeEventListener(ADMIN_CONFIG_TOKEN_UPDATED_EVENT, handleTokenUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveAndPublish() {
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback({ tone: "warning", text: "Resolve the required fields before publishing." });
      return;
    }
    const payload = {
      organisationName: form.organisationName.trim(),
      primaryColor: form.primaryColor.trim(),
      secondaryColor: form.secondaryColor.trim(),
      accentColor: form.accentColor.trim(),
      fontFamily: form.fontFamily.trim()
    };
    try {
      setIsSubmitting(true);
      // Create the document on first save, otherwise update its draft.
      if (!detail) {
        await request(`/api/config/admin/content/documents`, {
          method: "POST",
          body: JSON.stringify({
            key: DOCUMENT_KEY,
            type: "ui_copy",
            title: DOCUMENT_TITLE,
            initialPayload: payload
          })
        });
      } else {
        await request(`/api/config/admin/content/documents/${encodeURIComponent(DOCUMENT_KEY)}/draft`, {
          method: "PUT",
          body: JSON.stringify({ payload, changeSummary: "Updated branding from the Branding workspace" })
        });
      }
      // Re-read to get the fresh draft id, then publish it live.
      const fresh = await request<IntegrationDocumentDetail>(
        `/api/config/admin/content/documents/${encodeURIComponent(DOCUMENT_KEY)}`
      );
      const draftId = fresh.draft?.id;
      if (draftId) {
        await request(`/api/config/admin/content/documents/${encodeURIComponent(DOCUMENT_KEY)}/publish`, {
          method: "POST",
          body: JSON.stringify({ expectedDraftVersionId: draftId, publishNote: "Published branding" })
        });
      }
      await refresh();
      setFeedback({
        tone: "success",
        text: "Branding published. Reload the app to see the new name and theme everywhere."
      });
    } catch (error) {
      setFeedback({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  const published = detail?.published ?? null;

  return (
    <section className="integration-workspace">
      <header className="integration-workspace__header">
        <div>
          <h3 className="integration-workspace__title">Branding</h3>
          <p className="integration-workspace__description">
            White-label the platform: set the organisation name and theme colours used across the
            admin dashboard, the learner WhatsApp bot, and outgoing emails.
          </p>
        </div>
        <div className="integration-workspace__header-actions">
          <Button variant="secondary" onClick={() => void refresh()}>
            Reload
          </Button>
          {published ? (
            <Badge variant="success">Live v{published.versionNumber}</Badge>
          ) : (
            <Badge variant="neutral">Using defaults</Badge>
          )}
        </div>
      </header>

      {feedback ? (
        <div className="settings-workspace__feedback">
          <Badge variant={feedback.tone}>{feedback.text}</Badge>
        </div>
      ) : null}

      {loadError ? (
        <EmptyState title="Access Required" description={loadError} action={undefined} />
      ) : isLoading ? (
        <div className="integration-workspace__loading">
          <Badge variant="info">Loading branding...</Badge>
        </div>
      ) : (
        <section className="integration-workspace__editor">
          <div className="integration-workspace__editor-body">
            <Input
              id="branding-org-name"
              label="Organisation Name"
              value={form.organisationName}
              onChange={(event) => setForm({ ...form, organisationName: event.target.value })}
              hint="Shown across the dashboard, the bot's welcome message, and emails."
              {...(errors.organisationName ? { error: errors.organisationName } : {})}
            />

            <Input
              id="branding-primary-color"
              label="Primary Colour"
              type="color"
              value={form.primaryColor}
              onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
              hint="Main brand colour: buttons, links, and active states."
            />

            <Input
              id="branding-secondary-color"
              label="Secondary Colour"
              type="color"
              value={form.secondaryColor}
              onChange={(event) => setForm({ ...form, secondaryColor: event.target.value })}
              hint="Accent used for highlights and secondary emphasis."
            />

            <Input
              id="branding-accent-color"
              label="Accent Colour"
              type="color"
              value={form.accentColor}
              onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
              hint="Deeper accent used in gradients and emphasis."
            />

            <Select
              id="branding-font-family"
              label="Font Family"
              value={form.fontFamily}
              options={
                // A legacy free-text value (from before the curated set) still
                // displays instead of showing an empty control.
                FONT_CHOICES.some((choice) => choice.value === form.fontFamily)
                  ? FONT_CHOICES
                  : [
                      ...FONT_CHOICES,
                      { value: form.fontFamily, label: `${form.fontFamily} (custom)` }
                    ]
              }
              onChange={(value) => setForm({ ...form, fontFamily: value })}
              hint="Bundled with the app and self-hosted, so it loads for every visitor. Asap is the default."
            />
          </div>

          <div className="integration-workspace__editor-footer">
            <Button variant="secondary" onClick={() => setForm(toForm(detail))}>
              Reset
            </Button>
            <Button loading={isSubmitting} onClick={() => void saveAndPublish()}>
              Publish Branding
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}
