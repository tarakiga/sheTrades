"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  ConfirmationModal,
  EmptyState,
  IconActionButton,
  PublishWorkflowPanel,
  Table
} from "../ui";
import {
  ADMIN_CONFIG_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../lib/admin-config-auth";
import {
  TranslationSettingsForm,
  createEmptyTranslationForm,
  DEFAULT_TRANSLATION_TITLE
} from "./translation/TranslationSettingsForm";
import { TranslationReviewWorkspace } from "./translation/TranslationReviewWorkspace";
import type {
  TranslationFormState,
  TranslationIgboProviderKey,
  TranslationPidginProviderKey
} from "./translation/TranslationSettingsForm";
import type {
  IntegrationDocumentDetail,
  IntegrationHistoryResponse
} from "./types";

type FeedbackState = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type WorkspaceRow = {
  title: string;
  identifier: string;
  statusLabel: string;
  statusVariant: "info" | "success" | "warning" | "neutral";
  updatedAt: string;
  actionKey: string;
};

export type TranslationProviderConfig = {
  id: "translation";
  label: string;
  description: string;
  key: string;
  title: string;
  emptyTitle: string;
  emptyDescription: string;
};

/**
 * Matches translationConfigPayloadSchema (backend/src/config-platform/contracts.ts),
 * which extends translationIntegrationPayloadSchema with the `kind: "translation"`
 * discriminant used to route integration_config documents on the server.
 */
type TranslationPayload = {
  kind: "translation";
  title: string;
  enabled: boolean;
  providerByLanguage: {
    pcm: TranslationPidginProviderKey;
    ig: TranslationIgboProviderKey;
  };
  igboApi: { apiKey: string; baseUrl: string; dailyRequestLimit: number };
  gemini: { apiKey: string; model: string };
  anthropic: { apiKey: string; model: string };
  notes: string;
};

function PreviewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M2 10C3.8 6.8 6.6 5.2 10 5.2C13.4 5.2 16.2 6.8 18 10C16.2 13.2 13.4 14.8 10 14.8C6.6 14.8 3.8 13.2 2 10Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M4.2 13.8L13.8 4.2L15.8 6.2L6.2 15.8L3.5 16.5L4.2 13.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.8 6.2L13.8 8.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M4 5.2H16V8.5H4V5.2Z" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 8.5V14.8C5.5 15.35 5.95 15.8 6.5 15.8H13.5C14.05 15.8 14.5 15.35 14.5 14.8V8.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M8 11H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isTranslationPayload(value: unknown): value is TranslationPayload {
  if (!value || typeof value !== "object") return false;
  return (value as { kind?: unknown }).kind === "translation";
}

function providerLabel(key: TranslationIgboProviderKey) {
  switch (key) {
    case "igbo_api":
      return "Igbo API";
    case "gemini":
      return "Gemini";
    case "anthropic":
      return "Anthropic";
  }
}

function detailToForm(detail: IntegrationDocumentDetail | null): TranslationFormState {
  if (!detail) {
    return createEmptyTranslationForm();
  }
  const docTitle = detail.document.title || DEFAULT_TRANSLATION_TITLE;
  const candidatePayload = detail.draft?.payload ?? detail.published?.payload ?? null;
  if (!isTranslationPayload(candidatePayload)) {
    return { ...createEmptyTranslationForm(), title: docTitle };
  }
  const payload = candidatePayload;
  return {
    title: docTitle,
    enabled: payload.enabled !== false,
    pcmProvider: payload.providerByLanguage?.pcm === "anthropic" ? "anthropic" : "gemini",
    igProvider:
      payload.providerByLanguage?.ig === "igbo_api" || payload.providerByLanguage?.ig === "anthropic"
        ? payload.providerByLanguage.ig
        : "gemini",
    igboApiKey: payload.igboApi?.apiKey ?? "",
    igboApiBaseUrl: payload.igboApi?.baseUrl || "https://igboapi.com",
    igboApiDailyRequestLimit: String(payload.igboApi?.dailyRequestLimit ?? 2500),
    geminiApiKey: payload.gemini?.apiKey ?? "",
    geminiModel: payload.gemini?.model || "gemini-2.5-flash",
    anthropicApiKey: payload.anthropic?.apiKey ?? "",
    anthropicModel: payload.anthropic?.model || "claude-sonnet-5",
    notes: payload.notes ?? ""
  };
}

function validateForm(form: TranslationFormState) {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) {
    errors.title = "Give this translation integration a clear title.";
  }

  const dailyLimit = Number(form.igboApiDailyRequestLimit);
  const needsIgboApi = form.igProvider === "igbo_api";
  const needsGemini = form.pcmProvider === "gemini" || form.igProvider === "gemini";
  const needsAnthropic = form.pcmProvider === "anthropic" || form.igProvider === "anthropic";

  if (needsIgboApi) {
    if (!form.igboApiKey.trim()) {
      errors.igboApiKey = "Add the Igbo API key.";
    }
    if (!form.igboApiBaseUrl.trim()) {
      errors.igboApiBaseUrl = "Add the Igbo API base URL.";
    }
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    errors.igboApiDailyRequestLimit = "Enter a whole number of at least 1.";
  }
  if (needsGemini && !form.geminiApiKey.trim()) {
    errors.geminiApiKey = "Add the Gemini API key.";
  }
  if (needsAnthropic && !form.anthropicApiKey.trim()) {
    errors.anthropicApiKey = "Add the Anthropic API key.";
  }
  return errors;
}

function serializeForm(form: TranslationFormState): TranslationPayload {
  const dailyLimit = Number(form.igboApiDailyRequestLimit);
  return {
    kind: "translation",
    title: form.title.trim(),
    enabled: form.enabled,
    providerByLanguage: {
      pcm: form.pcmProvider,
      ig: form.igProvider
    },
    igboApi: {
      apiKey: form.igboApiKey.trim(),
      baseUrl: form.igboApiBaseUrl.trim(),
      dailyRequestLimit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.trunc(dailyLimit) : 2500
    },
    gemini: {
      apiKey: form.geminiApiKey.trim(),
      model: form.geminiModel.trim()
    },
    anthropic: {
      apiKey: form.anthropicApiKey.trim(),
      model: form.anthropicModel.trim()
    },
    notes: form.notes.trim()
  };
}

function getRowState(detail: IntegrationDocumentDetail | null) {
  if (!detail) {
    return { label: "Missing", variant: "neutral" as const };
  }
  if (!detail.document.isActive) {
    return { label: "In Trash", variant: "warning" as const };
  }
  if (detail.draft) {
    return { label: "Draft Ready", variant: "info" as const };
  }
  if (detail.published) {
    return { label: "Live", variant: "success" as const };
  }
  return { label: "Saved", variant: "neutral" as const };
}

function getIdentifierLabel(payload: TranslationPayload) {
  return `Pidgin: ${providerLabel(payload.providerByLanguage.pcm)} · Igbo: ${providerLabel(payload.providerByLanguage.ig)}`;
}

export function IntegrationTranslationWorkspace({
  provider
}: {
  provider: TranslationProviderConfig;
}) {
  const [token, setToken] = useState("");
  const [detail, setDetail] = useState<IntegrationDocumentDetail | null>(null);
  const [history, setHistory] = useState<IntegrationHistoryResponse["versions"]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [form, setForm] = useState<TranslationFormState>(createEmptyTranslationForm());
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
      setHistory([]);
      setLoadError("Save an access key in Integration before managing provider settings.");
      return;
    }

    try {
      setIsLoading(true);
      setLoadError("");
      const detailResponse = await request<IntegrationDocumentDetail>(
        `/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}`,
        undefined,
        accessToken
      );
      const historyResponse = await request<IntegrationHistoryResponse>(
        `/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/history`,
        undefined,
        accessToken
      );

      setDetail(detailResponse);
      setHistory(historyResponse.versions ?? []);
      setForm(detailToForm(detailResponse));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not found/i.test(message)) {
        setDetail(null);
        setHistory([]);
        setForm(createEmptyTranslationForm());
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
  }, [provider.id, provider.key]);

  function openCreate() {
    setForm(createEmptyTranslationForm());
    setErrors({});
    setIsEditing(true);
  }

  function openEdit() {
    setForm(detailToForm(detail));
    setErrors({});
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setErrors({});
    setForm(detailToForm(detail));
  }

  function updateField(field: keyof TranslationFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }) as TranslationFormState);
  }

  async function testConnection() {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback({
        tone: "warning",
        text: "Add the provider credentials before testing the connection."
      });
      return;
    }

    try {
      setIsTesting(true);
      const config = serializeForm(form);
      const response = await request<{
        message: string;
        result: { status: "healthy" | "degraded" | "failed"; message?: string };
      }>(`/api/integrations/admin/translation/test`, {
        method: "POST",
        body: JSON.stringify({ config })
      });
      const tone =
        response.result.status === "healthy"
          ? "success"
          : response.result.status === "degraded"
            ? "warning"
            : "danger";
      setFeedback({
        tone,
        text: [response.message, response.result.message].filter(Boolean).join(" — ")
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsTesting(false);
    }
  }

  async function saveDraft() {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback({
        tone: "warning",
        text: "Resolve the required fields before saving this draft."
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const serialized = serializeForm(form);
      if (!detail) {
        await request(`/api/config/admin/integration/documents`, {
          method: "POST",
          body: JSON.stringify({
            key: provider.key,
            type: "integration_config",
            title: form.title.trim(),
            initialPayload: serialized
          })
        });
      } else {
        await request(
          `/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/draft`,
          {
            method: "PUT",
            body: JSON.stringify({
              payload: serialized,
              changeSummary: "Updated translation settings from the integration workspace"
            })
          }
        );
      }
      await refresh();
      setIsEditing(false);
      setFeedback({
        tone: "success",
        text: "Translation draft saved successfully."
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function publish() {
    if (!detail?.draft?.id) {
      setFeedback({ tone: "warning", text: "Save a draft before publishing live." });
      return;
    }

    try {
      await request(
        `/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedDraftVersionId: detail.draft.id,
            publishNote: "Published from the Integration workspace"
          })
        }
      );
      await refresh();
      setFeedback({ tone: "success", text: "Translation settings are now live." });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function rollback() {
    const currentPublishedId = detail?.published?.id;
    const target = history.find(
      (item) =>
        (item.state === "published" || item.state === "archived") && item.id !== currentPublishedId
    );

    if (!target) {
      setFeedback({ tone: "warning", text: "No previous live version is available to restore." });
      return;
    }

    try {
      await request(
        `/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/rollback`,
        {
          method: "POST",
          body: JSON.stringify({
            targetVersionId: target.id,
            rollbackReason: "Restored a previous translation version from the settings workspace"
          })
        }
      );
      await refresh();
      setFeedback({ tone: "success", text: "Previous live version restored." });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function archiveOrRestore() {
    if (!detail) {
      return;
    }
    try {
      const path = detail.document.isActive ? "archive" : "reactivate";
      await request(
        `/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/${path}`,
        {
          method: "POST",
          body: JSON.stringify(
            detail.document.isActive
              ? { archiveReason: "Archived from the Integration workspace" }
              : { reactivateReason: "Reactivated from the Integration workspace" }
          )
        }
      );
      setConfirmArchiveOpen(false);
      await refresh();
      setFeedback({
        tone: "success",
        text: detail.document.isActive
          ? "Translation integration moved to trash."
          : "Translation integration restored successfully."
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const activePayload: TranslationPayload | null = useMemo(() => {
    if (!detail) return null;
    const source = detail.draft?.payload ?? detail.published?.payload ?? null;
    return isTranslationPayload(source) ? source : null;
  }, [detail]);

  const rowState = getRowState(detail);
  const row: WorkspaceRow | null = detail
    ? {
        title: detail.document.title,
        identifier: activePayload
          ? getIdentifierLabel(activePayload)
          : "Provider not selected",
        statusLabel: rowState.label,
        statusVariant: rowState.variant,
        updatedAt: formatTimestamp(detail.document.updatedAt),
        actionKey: detail.document.key
      }
    : null;

  return (
    <section className="integration-workspace">
      <header className="integration-workspace__header">
        <div>
          <h3 className="integration-workspace__title">{provider.title}</h3>
          <p className="integration-workspace__description">{provider.description}</p>
        </div>
        <div className="integration-workspace__header-actions">
          <Button variant="secondary" onClick={() => void refresh()}>
            Reload
          </Button>
          <Button onClick={detail ? openEdit : openCreate}>
            {detail ? "Configure Provider" : "Create Draft"}
          </Button>
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
          <Badge variant="info">Loading provider settings...</Badge>
        </div>
      ) : (
        <>
          {!detail ? (
            <EmptyState
              title={provider.emptyTitle}
              description={provider.emptyDescription}
              action={<Button onClick={openCreate}>Create Draft</Button>}
            />
          ) : (
            <>
              <section className="integration-workspace__table-shell">
                <div className="integration-workspace__table-header">
                  <div>
                    <h4 className="integration-workspace__table-title">Review And Publish Changes</h4>
                    <p className="integration-workspace__table-description">
                      Review the live translation providers, edit credentials, then publish so the
                      review workflow can translate lesson and quiz content.
                    </p>
                  </div>
                </div>

                <Table
                  wrapperClassName="integration-table-wrap"
                  tableClassName="integration-table"
                  columns={[
                    {
                      key: "title",
                      header: "Integration",
                      render: (value, currentRow) => (
                        <div className="integration-table__identity">
                          <span className="integration-table__title">{String(value)}</span>
                          <span className="integration-table__meta">{currentRow.identifier}</span>
                        </div>
                      )
                    },
                    {
                      key: "statusLabel",
                      header: "Status",
                      render: (value, currentRow) => (
                        <Badge variant={currentRow.statusVariant}>{String(value)}</Badge>
                      )
                    },
                    {
                      key: "updatedAt",
                      header: "Updated",
                      render: (value) => (
                        <span className="integration-table__meta">{String(value)}</span>
                      )
                    },
                    {
                      key: "actionKey",
                      header: "Actions",
                      render: () => (
                        <div className="integration-table__actions">
                          <IconActionButton
                            icon={<PreviewIcon />}
                            label="Preview"
                            onClick={openEdit}
                          />
                          <IconActionButton
                            icon={<EditIcon />}
                            label="Edit"
                            tone="primary"
                            onClick={openEdit}
                          />
                          <IconActionButton
                            icon={<ArchiveIcon />}
                            label={detail.document.isActive ? "Move To Trash" : "Restore"}
                            tone={detail.document.isActive ? "danger" : "success"}
                            onClick={() => setConfirmArchiveOpen(true)}
                          />
                        </div>
                      )
                    }
                  ]}
                  rows={row ? [row] : []}
                />
              </section>

              <PublishWorkflowPanel
                draftVersionLabel={detail.draft ? `v${detail.draft.versionNumber}` : "No draft"}
                publishedVersionLabel={
                  detail.published ? `v${detail.published.versionNumber}` : "Not live"
                }
                lastPublishedBy={detail.published?.publishedBy ?? "n/a"}
                lastPublishedAt={formatTimestamp(detail.published?.publishedAt)}
                hasChanges={Boolean(detail.draft)}
                labels={{
                  title: "Draft And Publish Workflow",
                  description:
                    "Edit provider credentials in place, publish approved changes, or restore a previous live version when needed.",
                  currentDraft: "Current Draft",
                  publishedVersion: "Published Version",
                  unpublishedChanges: "Draft Ready",
                  noChanges: "No Draft Pending",
                  previewDraft: "Preview",
                  publish: "Publish Live",
                  rollback: "Restore Previous",
                  by: "by"
                }}
                onPreviewDraft={openEdit}
                onPublish={() => void publish()}
                onRollback={() => void rollback()}
              />
            </>
          )}

          {isEditing ? (
            <section className="integration-workspace__editor">
              <div className="integration-workspace__editor-header">
                <div>
                  <h4 className="integration-workspace__editor-title">
                    {detail ? "Edit Translation Settings" : "Set Up Translation"}
                  </h4>
                  <p className="integration-workspace__editor-description">
                    Pick a provider per target language and enter the credentials the review
                    workflow should use to translate content. Changes are saved as a draft until
                    you publish.
                  </p>
                </div>
              </div>

              <div className="integration-workspace__editor-body">
                <TranslationSettingsForm
                  value={form}
                  errors={errors}
                  disabled={isSubmitting}
                  onChange={updateField}
                />
              </div>

              <div className="integration-workspace__editor-footer">
                <Button variant="secondary" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  loading={isTesting}
                  disabled={isSubmitting}
                  onClick={() => void testConnection()}
                >
                  Test Connection
                </Button>
                <Button loading={isSubmitting} disabled={isTesting} onClick={() => void saveDraft()}>
                  {detail ? "Update Draft" : "Save Draft"}
                </Button>
              </div>
            </section>
          ) : null}
        </>
      )}

      <ConfirmationModal
        open={confirmArchiveOpen}
        title={detail?.document.isActive ? "Move Translation To Trash?" : "Restore Translation?"}
        description={
          detail?.document.isActive
            ? "The saved provider settings will stay in history, but this translation integration will no longer appear as the active live connection until it is restored."
            : "This will make the translation integration visible again with its most recent live configuration."
        }
        confirmLabel={detail?.document.isActive ? "Move To Trash" : "Restore"}
        tone={detail?.document.isActive ? "danger" : "warning"}
        cancelLabel="Cancel"
        onCancel={() => setConfirmArchiveOpen(false)}
        onConfirm={() => void archiveOrRestore()}
      />

      <TranslationReviewWorkspace />
    </section>
  );
}
