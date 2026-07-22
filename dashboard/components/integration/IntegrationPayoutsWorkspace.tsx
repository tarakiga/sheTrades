"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  ConfirmationModal,
  EmptyState,
  IconActionButton,
  Input,
  PublishWorkflowPanel,
  Table
} from "../ui";
import {
  ADMIN_CONFIG_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../lib/admin-config-auth";
import { PayoutsProviderSelector } from "./payouts/PayoutsProviderSelector";
import type {
  PayoutsProviderSelectorChange,
  ProviderKey as PayoutsProviderKey
} from "./payouts/PayoutsProviderSelector";
import {
  PayoutsCredentialFields,
  createEmptyPayoutsPayload
} from "./payouts/PayoutsCredentialFields";
import type { PayoutsIntegrationPayload } from "./payouts/PayoutsCredentialFields";
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

export type PayoutsProviderConfig = {
  id: "payouts";
  label: string;
  description: string;
  key: string;
  title: string;
  emptyTitle: string;
  emptyDescription: string;
};

type PayoutsFormState = {
  title: string;
  payload: PayoutsIntegrationPayload;
};

const DEFAULT_TITLE = "Primary Payouts Integration";

function createEmptyPayoutsForm(): PayoutsFormState {
  return {
    title: DEFAULT_TITLE,
    payload: createEmptyPayoutsPayload("africas_talking")
  };
}

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

function isPayoutsPayload(value: unknown): value is PayoutsIntegrationPayload {
  if (!value || typeof value !== "object") return false;
  const provider = (value as { provider?: unknown }).provider;
  return provider === "africas_talking" || provider === "termii" || provider === "reloadly";
}

function detailToForm(detail: IntegrationDocumentDetail | null): PayoutsFormState {
  if (!detail) {
    return createEmptyPayoutsForm();
  }
  const rawTitle = (detail.draft?.payload?.title ?? detail.published?.payload?.title) as
    | string
    | undefined;
  const candidatePayload = detail.draft?.payload ?? detail.published?.payload;
  const payload = isPayoutsPayload(candidatePayload)
    ? (candidatePayload as PayoutsIntegrationPayload)
    : createEmptyPayoutsPayload("africas_talking");
  return {
    title:
      typeof rawTitle === "string" && rawTitle.trim().length > 0
        ? rawTitle
        : detail.document.title || DEFAULT_TITLE,
    payload
  };
}

function validateForm(form: PayoutsFormState) {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) {
    errors.title = "Give this payouts integration a clear title.";
  }
  const { payload } = form;
  if (payload.provider === "africas_talking") {
    if (!payload.africasTalking.username.trim()) {
      errors.username = "Add the Africa's Talking API username.";
    }
    if (!payload.africasTalking.apiKey.trim()) {
      errors.apiKey = "Add the Africa's Talking API key.";
    }
  } else if (payload.provider === "termii") {
    if (!payload.termii.apiKey.trim()) {
      errors.apiKey = "Add the Termii API key.";
    }
  } else if (payload.provider === "reloadly") {
    if (!payload.reloadly.clientId.trim()) {
      errors.clientId = "Add the Reloadly client ID.";
    }
    if (!payload.reloadly.clientSecret.trim()) {
      errors.clientSecret = "Add the Reloadly client secret.";
    }
  }
  return errors;
}

function serializeForm(form: PayoutsFormState) {
  const trimmedTitle = form.title.trim();
  const { payload } = form;
  if (payload.provider === "africas_talking") {
    return {
      ...payload,
      title: trimmedTitle,
      africasTalking: {
        username: payload.africasTalking.username.trim(),
        apiKey: payload.africasTalking.apiKey.trim()
      }
    };
  }
  if (payload.provider === "termii") {
    const senderId = payload.termii.senderId?.trim();
    return {
      ...payload,
      title: trimmedTitle,
      termii: {
        apiKey: payload.termii.apiKey.trim(),
        ...(senderId && senderId.length > 0 ? { senderId } : {})
      }
    };
  }
  return {
    ...payload,
    title: trimmedTitle,
    reloadly: {
      clientId: payload.reloadly.clientId.trim(),
      clientSecret: payload.reloadly.clientSecret.trim()
    }
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

function getProviderLabel(provider: PayoutsProviderKey) {
  switch (provider) {
    case "africas_talking":
      return "Africa's Talking";
    case "termii":
      return "Termii";
    case "reloadly":
      return "Reloadly";
  }
}

function getIdentifierLabel(payload: PayoutsIntegrationPayload) {
  const providerLabel = getProviderLabel(payload.provider);
  return `${providerLabel}${payload.sandbox ? " (sandbox)" : ""}`;
}

export function IntegrationPayoutsWorkspace({
  provider
}: {
  provider: PayoutsProviderConfig;
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
  const [form, setForm] = useState<PayoutsFormState>(createEmptyPayoutsForm());
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
        setForm(createEmptyPayoutsForm());
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
    setForm(createEmptyPayoutsForm());
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

  function handleSelectorChange(next: PayoutsProviderSelectorChange) {
    if (next.provider !== form.payload.provider) {
      const blank = createEmptyPayoutsPayload(next.provider);
      setForm({
        ...form,
        payload: { ...blank, sandbox: next.sandbox }
      });
      return;
    }
    setForm({
      ...form,
      payload: { ...form.payload, sandbox: next.sandbox }
    });
  }

  function handleCredentialsChange(next: PayoutsIntegrationPayload) {
    setForm({ ...form, payload: next });
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
      const serialized = serializeForm(form) as Record<string, unknown>;
      const { title: _title, ...config } = serialized;
      const response = await request<{
        message: string;
        result: { status: "healthy" | "degraded" | "failed"; message?: string };
      }>(`/api/integrations/admin/payouts/test`, {
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
        text: [response.message, response.result.message].filter(Boolean).join(" - ")
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
              changeSummary: "Updated payouts settings from the integration workspace"
            })
          }
        );
      }
      await refresh();
      setIsEditing(false);
      setFeedback({
        tone: "success",
        text: "Payouts draft saved successfully."
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
      setFeedback({ tone: "success", text: "Payouts settings are now live." });
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
            rollbackReason: "Restored a previous payouts version from the settings workspace"
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
          ? "Payouts integration moved to trash."
          : "Payouts integration restored successfully."
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const activePayload: PayoutsIntegrationPayload | null = useMemo(() => {
    if (!detail) return null;
    const source = detail.draft?.payload ?? detail.published?.payload ?? null;
    return isPayoutsPayload(source) ? (source as PayoutsIntegrationPayload) : null;
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
                      Review the live payouts provider, edit credentials, then publish so the
                      runtime worker can dispatch learner rewards.
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
                    "Edit credentials in place, publish approved changes, or restore a previous live version when needed.",
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
                    {detail ? "Edit Payouts Settings" : "Set Up Payouts"}
                  </h4>
                  <p className="integration-workspace__editor-description">
                    Pick a provider and enter the credentials the worker should use to issue
                    rewards. Changes are saved as a draft until you publish.
                  </p>
                </div>
              </div>

              <div className="integration-workspace__editor-body">
                <Input
                  id="payouts-title"
                  label="Integration Title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  hint="Use a clear operational name so admins know which connection is active."
                  {...(errors.title ? { error: errors.title } : {})}
                />

                <PayoutsProviderSelector
                  value={form.payload.provider}
                  sandbox={form.payload.sandbox}
                  onChange={handleSelectorChange}
                  disabled={isSubmitting}
                />

                <PayoutsCredentialFields
                  provider={form.payload.provider}
                  value={form.payload}
                  onChange={handleCredentialsChange}
                  errors={errors}
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
        title={detail?.document.isActive ? "Move Payouts To Trash?" : "Restore Payouts?"}
        description={
          detail?.document.isActive
            ? "The saved provider settings will stay in history, but this payouts integration will no longer appear as the active live connection until it is restored."
            : "This will make the payouts integration visible again with its most recent live configuration."
        }
        confirmLabel={detail?.document.isActive ? "Move To Trash" : "Restore"}
        tone={detail?.document.isActive ? "danger" : "warning"}
        cancelLabel="Cancel"
        onCancel={() => setConfirmArchiveOpen(false)}
        onConfirm={() => void archiveOrRestore()}
      />
    </section>
  );
}
