"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  ConfirmationModal,
  EmptyState,
  IconActionButton,
  PublishWorkflowPanel,
  Table,
  Tabs
} from "../ui";
import { SettingsWorkspaceHeader } from "../config/SettingsWorkspaceHeader";
import { WhatsAppSandboxSimulator } from "./WhatsAppSandboxSimulator";
import {
  ADMIN_CONFIG_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../lib/admin-config-auth";
import { IntegrationConfigDrawer } from "./IntegrationConfigDrawer";
import { IntegrationPreviewDrawer } from "./IntegrationPreviewDrawer";
import type {
  IntegrationConnectionResult,
  IntegrationDocumentDetail,
  IntegrationFormState,
  IntegrationHistoryResponse,
  IntegrationProviderId,
  NotificationIntegrationForm,
  WhatsAppIntegrationForm
} from "./types";
import {
  createEmptyNotificationForm,
  createEmptyWhatsAppForm,
  isWhatsAppForm
} from "./types";

type IntegrationSettingsWorkspaceProps = {
  copy: Record<string, string>;
};

type FeedbackState = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type WorkspaceRow = {
  title: string;
  identifier: string;
  statusLabel: string;
  statusVariant: "info" | "success" | "warning" | "neutral";
  healthLabel: string;
  healthVariant: "info" | "success" | "warning" | "danger" | "neutral";
  updatedAt: string;
  actionKey: string;
};

type ProviderConfig = {
  id: IntegrationProviderId;
  label: string;
  description: string;
  key: string;
  title: string;
  emptyTitle: string;
  emptyDescription: string;
};

const PROVIDERS: Record<IntegrationProviderId, ProviderConfig> = {
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Manage the verified webhook, token, and phone line used for WhatsApp automation.",
    key: "integration.whatsapp.primary",
    title: "WhatsApp Integration",
    emptyTitle: "WhatsApp is not configured yet",
    emptyDescription:
      "Create the managed WhatsApp draft so admins can save credentials, test the connection, and publish the live provider settings."
  },
  notification: {
    id: "notification",
    label: "Notification",
    description: "Manage SMTP delivery settings for transactional email notifications.",
    key: "integration.notification.smtp",
    title: "Notification Integration",
    emptyTitle: "Notification delivery is not configured yet",
    emptyDescription:
      "Create the managed SMTP draft so admins can verify delivery credentials before they publish the live notification sender."
  }
};

function tFactory(copy: Record<string, string>) {
  return (key: string, fallback: string) => {
    const value = copy[key];
    return typeof value === "string" && value.trim().length > 0 ? value : fallback;
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

function TestIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M10 3.5V10L14.2 12.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
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

function toFeedbackTone(result: IntegrationConnectionResult["status"]): FeedbackState["tone"] {
  switch (result) {
    case "connected":
      return "success";
    case "invalid":
      return "warning";
    case "failed":
      return "danger";
  }
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

function getIdentifierLabel(provider: IntegrationProviderId, payload: Record<string, unknown>) {
  if (provider === "whatsapp") {
    return String(payload.phoneNumberId ?? "Phone number ID not set");
  }
  return String(payload.host ?? "SMTP host not set");
}

function detailToForm(
  provider: IntegrationProviderId,
  detail: IntegrationDocumentDetail | null
): IntegrationFormState {
  const source = (detail?.draft?.payload ?? detail?.published?.payload ?? {}) as Record<string, unknown>;
  if (provider === "whatsapp") {
    return {
      title: typeof source.title === "string" ? source.title : "Primary WhatsApp Integration",
      provider: "meta_whatsapp_cloud",
      enabled: source.enabled !== false,
      verifyToken: typeof source.verifyToken === "string" ? source.verifyToken : "",
      accessToken: typeof source.accessToken === "string" ? source.accessToken : "",
      appSecret: typeof source.appSecret === "string" ? source.appSecret : "",
      phoneNumberId: typeof source.phoneNumberId === "string" ? source.phoneNumberId : "",
      businessAccountId:
        typeof source.businessAccountId === "string" ? source.businessAccountId : "",
      webhookPath:
        typeof source.webhookPath === "string" ? source.webhookPath : "/webhook/whatsapp",
      apiVersion: typeof source.apiVersion === "string" ? source.apiVersion : "v23.0",
      notes: typeof source.notes === "string" ? source.notes : ""
    };
  }

  return {
    title: typeof source.title === "string" ? source.title : "Primary SMTP Notification Integration",
    provider: "smtp",
    enabled: source.enabled !== false,
    host: typeof source.host === "string" ? source.host : "",
    port:
      typeof source.port === "number" && Number.isFinite(source.port)
        ? String(source.port)
        : "587",
    secure: Boolean(source.secure),
    username: typeof source.username === "string" ? source.username : "",
    password: typeof source.password === "string" ? source.password : "",
    fromName: typeof source.fromName === "string" ? source.fromName : "SheTrades",
    fromEmail: typeof source.fromEmail === "string" ? source.fromEmail : "",
    replyToEmail: typeof source.replyToEmail === "string" ? source.replyToEmail : "",
    notes: typeof source.notes === "string" ? source.notes : ""
  };
}

function validateForm(form: IntegrationFormState) {
  const errors: Record<string, string> = {};

  if (!form.title.trim()) {
    errors.title = "Give this integration a clear title.";
  }

  if (isWhatsAppForm(form)) {
    if (!form.verifyToken.trim()) {
      errors.verifyToken = "Add the webhook verify token.";
    }
    if (!form.accessToken.trim()) {
      errors.accessToken = "Add the WhatsApp access token.";
    }
    if (!form.phoneNumberId.trim()) {
      errors.phoneNumberId = "Add the phone number ID.";
    }
    if (!form.webhookPath.trim() || !form.webhookPath.startsWith("/")) {
      errors.webhookPath = "Use a webhook path that starts with '/'.";
    }
    if (!form.apiVersion.trim()) {
      errors.apiVersion = "Add the provider API version.";
    }
    return errors;
  }

  const parsedPort = Number(form.port);
  if (!form.host.trim()) {
    errors.host = "Add the SMTP host.";
  }
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    errors.port = "Use a valid SMTP port.";
  }
  if (!form.username.trim()) {
    errors.username = "Add the SMTP username.";
  }
  if (!form.password.trim()) {
    errors.password = "Add the SMTP password.";
  }
  if (!form.fromName.trim()) {
    errors.fromName = "Add the sender name.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.fromEmail)) {
    errors.fromEmail = "Use a valid sender email address.";
  }
  if (
    form.replyToEmail.trim().length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.replyToEmail.trim())
  ) {
    errors.replyToEmail = "Use a valid reply-to email address.";
  }
  return errors;
}

function serializeForm(form: IntegrationFormState) {
  if (isWhatsAppForm(form)) {
    return {
      ...form,
      title: form.title.trim(),
      verifyToken: form.verifyToken.trim(),
      accessToken: form.accessToken.trim(),
      appSecret: form.appSecret.trim(),
      phoneNumberId: form.phoneNumberId.trim(),
      businessAccountId: form.businessAccountId.trim(),
      webhookPath: form.webhookPath.trim(),
      apiVersion: form.apiVersion.trim(),
      notes: form.notes.trim()
    };
  }

  return {
    ...form,
    title: form.title.trim(),
    host: form.host.trim(),
    port: Number(form.port),
    username: form.username.trim(),
    password: form.password.trim(),
    fromName: form.fromName.trim(),
    fromEmail: form.fromEmail.trim(),
    replyToEmail: form.replyToEmail.trim(),
    notes: form.notes.trim()
  };
}

function IntegrationProviderWorkspace({
  copy,
  provider
}: {
  copy: Record<string, string>;
  provider: ProviderConfig;
}) {
  const [token, setToken] = useState("");
  const [detail, setDetail] = useState<IntegrationDocumentDetail | null>(null);
  const [history, setHistory] = useState<IntegrationHistoryResponse["versions"]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [form, setForm] = useState<IntegrationFormState>(
    provider.id === "whatsapp" ? createEmptyWhatsAppForm() : createEmptyNotificationForm()
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [connectionResult, setConnectionResult] = useState<IntegrationConnectionResult | null>(null);

  const t = useMemo(() => tFactory(copy), [copy]);

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
      throw new Error(
        typeof body.message === "string"
          ? body.message
          : t("configAdmin.error.requestFailed", "Request failed")
      );
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
      setForm(detailToForm(provider.id, detailResponse));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not found/i.test(message)) {
        setDetail(null);
        setHistory([]);
        setForm(provider.id === "whatsapp" ? createEmptyWhatsAppForm() : createEmptyNotificationForm());
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
  }, [provider.id, provider.key]);

  function openCreate() {
    setDrawerMode("create");
    setForm(provider.id === "whatsapp" ? createEmptyWhatsAppForm() : createEmptyNotificationForm());
    setErrors({});
    setDrawerOpen(true);
  }

  function openEdit() {
    setDrawerMode(detail ? "edit" : "create");
    setForm(detailToForm(provider.id, detail));
    setErrors({});
    setDrawerOpen(true);
  }

  function updateField(field: string, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }) as IntegrationFormState);
  }

  async function runConnectionTest(targetForm = form) {
    const nextErrors = validateForm(targetForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const invalidResult: IntegrationConnectionResult = {
        provider: targetForm.provider,
        status: "invalid",
        summary: "Fix the required fields before running a connection test.",
        testedAt: new Date().toISOString()
      };
      setConnectionResult(invalidResult);
      setFeedback({
        tone: "warning",
        text: invalidResult.summary
      });
      return;
    }

    try {
      setIsTesting(true);
      const response = await request<{ result: IntegrationConnectionResult }>(
        `/api/integrations/admin/${provider.id}/test`,
        {
          method: "POST",
          body: JSON.stringify({
            config: serializeForm(targetForm)
          })
        }
      );
      setConnectionResult(response.result);
      setFeedback({
        tone: toFeedbackTone(response.result.status),
        text: response.result.summary
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
      if (!detail) {
        await request(`/api/config/admin/integration/documents`, {
          method: "POST",
          body: JSON.stringify({
            key: provider.key,
            type: "integration_config",
            title: form.title.trim(),
            initialPayload: serializeForm(form)
          })
        });
      } else {
        await request(`/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/draft`, {
          method: "PUT",
          body: JSON.stringify({
            payload: serializeForm(form),
            changeSummary: "Updated integration settings from the settings workspace"
          })
        });
      }
      setDrawerOpen(false);
      await refresh();
      setFeedback({
        tone: "success",
        text: "Integration draft saved successfully."
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
      setFeedback({
        tone: "warning",
        text: "Save a draft before publishing live."
      });
      return;
    }

    try {
      await request(`/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/publish`, {
        method: "POST",
        body: JSON.stringify({
          expectedDraftVersionId: detail.draft.id,
          publishNote: "Published from the Integration workspace"
        })
      });
      await refresh();
      setFeedback({
        tone: "success",
        text: "Integration settings are now live."
      });
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
      (item) => (item.state === "published" || item.state === "archived") && item.id !== currentPublishedId
    );

    if (!target) {
      setFeedback({
        tone: "warning",
        text: "No previous live version is available to restore."
      });
      return;
    }

    try {
      await request(`/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/rollback`, {
        method: "POST",
        body: JSON.stringify({
          targetVersionId: target.id,
          rollbackReason: "Restored a previous integration version from the settings workspace"
        })
      });
      await refresh();
      setFeedback({
        tone: "success",
        text: "Previous live version restored."
      });
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
      await request(`/api/config/admin/integration/documents/${encodeURIComponent(provider.key)}/${path}`, {
        method: "POST",
        body: JSON.stringify(
          detail.document.isActive
            ? { archiveReason: "Archived from the Integration workspace" }
            : { reactivateReason: "Reactivated from the Integration workspace" }
        )
      });
      setConfirmArchiveOpen(false);
      await refresh();
      setFeedback({
        tone: "success",
        text: detail.document.isActive
          ? "Integration moved to trash."
          : "Integration restored successfully."
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const activePayload = (detail?.draft?.payload ?? detail?.published?.payload ?? {}) as Record<
    string,
    unknown
  >;
  const rowState = getRowState(detail);
  const row: WorkspaceRow | null = detail
    ? {
        title: detail.document.title,
        identifier: getIdentifierLabel(provider.id, activePayload),
        statusLabel: rowState.label,
        statusVariant: rowState.variant,
        healthLabel: connectionResult
          ? connectionResult.status === "connected"
            ? "Connected"
            : connectionResult.status === "invalid"
              ? "Invalid"
              : "Failed"
          : "Not Tested",
        healthVariant: connectionResult
          ? connectionResult.status === "connected"
            ? "success"
            : connectionResult.status === "invalid"
              ? "warning"
              : "danger"
          : "neutral",
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
                      Review the live connection, check its health, and open the drawer to adjust the managed provider settings.
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
                      key: "healthLabel",
                      header: "Health",
                      render: (value, currentRow) => (
                        <Badge variant={currentRow.healthVariant}>{String(value)}</Badge>
                      )
                    },
                    {
                      key: "updatedAt",
                      header: "Updated",
                      render: (value) => <span className="integration-table__meta">{String(value)}</span>
                    },
                    {
                      key: "actionKey",
                      header: "Actions",
                      render: () => (
                        <div className="integration-table__actions">
                          <IconActionButton icon={<PreviewIcon />} label="Preview" onClick={() => setPreviewOpen(true)} />
                          <IconActionButton icon={<EditIcon />} label="Edit" tone="primary" onClick={openEdit} />
                          <IconActionButton
                            icon={<TestIcon />}
                            label="Test Connection"
                            tone="success"
                            loading={isTesting}
                            onClick={() => void runConnectionTest(detailToForm(provider.id, detail))}
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
                publishedVersionLabel={detail.published ? `v${detail.published.versionNumber}` : "Not live"}
                lastPublishedBy={detail.published?.publishedBy ?? "n/a"}
                lastPublishedAt={formatTimestamp(detail.published?.publishedAt)}
                hasChanges={Boolean(detail.draft)}
                labels={{
                  title: "Draft And Publish Workflow",
                  description:
                    "Run connection checks on the draft, publish approved changes, or restore a previous live version when needed.",
                  currentDraft: "Current Draft",
                  publishedVersion: "Published Version",
                  unpublishedChanges: "Draft Ready",
                  noChanges: "No Draft Pending",
                  previewDraft: "Preview",
                  publish: "Publish Live",
                  rollback: "Restore Previous",
                  by: "by"
                }}
                onPreviewDraft={() => setPreviewOpen(true)}
                onPublish={() => void publish()}
                onRollback={() => void rollback()}
              />
            </>
          )}

          {provider.id === "whatsapp" && (
            <WhatsAppSandboxSimulator />
          )}
        </>
      )}

      <IntegrationConfigDrawer
        open={drawerOpen}
        provider={provider.id}
        mode={drawerMode}
        value={form}
        errors={errors}
        feedback={feedback}
        connectionResult={connectionResult}
        isSubmitting={isSubmitting}
        isTesting={isTesting}
        onChange={updateField}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => void saveDraft()}
        onTestConnection={() => void runConnectionTest()}
      />

      <IntegrationPreviewDrawer
        open={previewOpen}
        provider={provider.id}
        detail={detail}
        history={history}
        connectionResult={connectionResult}
        onClose={() => setPreviewOpen(false)}
        onEdit={() => {
          setPreviewOpen(false);
          openEdit();
        }}
      />

      <ConfirmationModal
        open={confirmArchiveOpen}
        title={detail?.document.isActive ? "Move Integration To Trash?" : "Restore Integration?"}
        description={
          detail?.document.isActive
            ? "The saved provider settings will stay in history, but this integration will no longer appear as the active live connection until it is restored."
            : "This will make the integration visible again with its most recent live configuration."
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

export function IntegrationSettingsWorkspace({ copy }: IntegrationSettingsWorkspaceProps) {
  const t = useMemo(() => tFactory(copy), [copy]);

  return (
    <section className="settings-workspace">
      <SettingsWorkspaceHeader
        title={t("integration.workspace.title", "Integration Workspace")}
        description={t(
          "integration.workspace.description",
          "Manage provider credentials, test connectivity, and publish operational integrations from one premium workspace."
        )}
        summary={[
          { label: t("integration.summary.providers", "Providers"), value: "2" },
          { label: t("integration.summary.access", "Access"), value: "Admin Only" },
          { label: t("integration.summary.workflow", "Workflow"), value: "Draft + Live" }
        ]}
      />

      <div className="integration-tabs-shell">
        <Tabs
          activeId="whatsapp"
          items={[
            {
              id: PROVIDERS.whatsapp.id,
              label: PROVIDERS.whatsapp.label,
              content: <IntegrationProviderWorkspace copy={copy} provider={PROVIDERS.whatsapp} />
            },
            {
              id: PROVIDERS.notification.id,
              label: PROVIDERS.notification.label,
              content: <IntegrationProviderWorkspace copy={copy} provider={PROVIDERS.notification} />
            }
          ]}
        />
      </div>
    </section>
  );
}
