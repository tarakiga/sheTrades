"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PublishWorkflowPanel,
  Select
} from "../ui";
import {
  ADMIN_CONFIG_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../lib/admin-config-auth";
import type { IntegrationDocumentDetail, IntegrationHistoryResponse } from "./types";

const DOCUMENT_KEY = "reward.rules.primary";
const DEFAULT_TITLE = "Primary Reward Rule";

type FeedbackState = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type RewardRulesFormState = {
  title: string;
  amount: string;
  channel: "airtime";
  enabled: boolean;
};

type RewardRulesPayload = {
  kind: "reward_rules";
  amount: number;
  channel: "airtime";
  enabled: boolean;
};

function isRewardRulesPayload(value: unknown): value is RewardRulesPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown };
  return v.kind === "reward_rules";
}

function createEmptyForm(): RewardRulesFormState {
  return {
    title: DEFAULT_TITLE,
    amount: "500",
    channel: "airtime",
    enabled: true
  };
}

function detailToForm(detail: IntegrationDocumentDetail | null): RewardRulesFormState {
  if (!detail) {
    return createEmptyForm();
  }
  const candidatePayload = detail.draft?.payload ?? detail.published?.payload ?? null;
  const docTitle = detail.document.title || DEFAULT_TITLE;
  if (!isRewardRulesPayload(candidatePayload)) {
    return { ...createEmptyForm(), title: docTitle };
  }
  return {
    title: docTitle,
    amount: String(candidatePayload.amount),
    channel: candidatePayload.channel,
    enabled: candidatePayload.enabled
  };
}

function validateForm(form: RewardRulesFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) {
    errors.title = "Give this reward rule a clear title.";
  }
  if (!(Number(form.amount) > 0)) {
    errors.amount = "Enter a reward amount greater than zero.";
  }
  return errors;
}

function serializePayload(form: RewardRulesFormState): RewardRulesPayload {
  return {
    kind: "reward_rules",
    amount: Number(form.amount),
    channel: form.channel,
    enabled: form.enabled
  };
}

function formatTimestamp(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const CHANNEL_OPTIONS = [{ value: "airtime", label: "Airtime" }];

export function RewardRulesWorkspace() {
  const [token, setToken] = useState("");
  const [detail, setDetail] = useState<IntegrationDocumentDetail | null>(null);
  const [history, setHistory] = useState<IntegrationHistoryResponse["versions"]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<RewardRulesFormState>(createEmptyForm());
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
      setLoadError("Save an access key in Integration before managing reward rule settings.");
      return;
    }

    try {
      setIsLoading(true);
      setLoadError("");
      const detailResponse = await request<IntegrationDocumentDetail>(
        `/api/config/admin/integration/documents/${encodeURIComponent(DOCUMENT_KEY)}`,
        undefined,
        accessToken
      );
      const historyResponse = await request<IntegrationHistoryResponse>(
        `/api/config/admin/integration/documents/${encodeURIComponent(DOCUMENT_KEY)}/history`,
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
        setForm(createEmptyForm());
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

  function openCreate() {
    setForm(createEmptyForm());
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
      const payload = serializePayload(form);
      if (!detail) {
        await request(`/api/config/admin/integration/documents`, {
          method: "POST",
          body: JSON.stringify({
            key: DOCUMENT_KEY,
            type: "integration_config",
            title: form.title.trim(),
            initialPayload: payload
          })
        });
      } else {
        await request(
          `/api/config/admin/integration/documents/${encodeURIComponent(DOCUMENT_KEY)}/draft`,
          {
            method: "PUT",
            body: JSON.stringify({
              payload,
              changeSummary: "Updated reward rule settings from the integration workspace"
            })
          }
        );
      }
      await refresh();
      setIsEditing(false);
      setFeedback({
        tone: "success",
        text: "Reward rule draft saved successfully."
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
        `/api/config/admin/integration/documents/${encodeURIComponent(DOCUMENT_KEY)}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedDraftVersionId: detail.draft.id,
            publishNote: "Published from the Integration workspace"
          })
        }
      );
      await refresh();
      setFeedback({ tone: "success", text: "Reward rule is now live." });
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
        `/api/config/admin/integration/documents/${encodeURIComponent(DOCUMENT_KEY)}/rollback`,
        {
          method: "POST",
          body: JSON.stringify({
            targetVersionId: target.id,
            rollbackReason: "Restored a previous reward rule version from the settings workspace"
          })
        }
      );
      await refresh();
      setFeedback({ tone: "success", text: "Previous live reward rule restored." });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const activePayload: RewardRulesPayload | null = (() => {
    if (!detail) return null;
    const source = detail.published?.payload ?? detail.draft?.payload ?? null;
    return isRewardRulesPayload(source) ? source : null;
  })();

  return (
    <section className="integration-workspace">
      <header className="integration-workspace__header">
        <div>
          <h3 className="integration-workspace__title">Reward Rules</h3>
          <p className="integration-workspace__description">
            Configure the airtime reward amount issued to learners when reward rules fire.
          </p>
        </div>
        <div className="integration-workspace__header-actions">
          <Button variant="secondary" onClick={() => void refresh()}>
            Reload
          </Button>
          <Button onClick={detail ? openEdit : openCreate}>
            {detail ? "Edit Rule" : "Create Draft"}
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
          <Badge variant="info">Loading reward rule settings...</Badge>
        </div>
      ) : (
        <>
          {!detail ? (
            <EmptyState
              title="No Reward Rule Configured"
              description="Create a draft to define the airtime reward amount the system will issue to learners."
              action={<Button onClick={openCreate}>Create Draft</Button>}
            />
          ) : (
            <>
              <section className="integration-workspace__active-rule">
                <div className="integration-workspace__table-header">
                  <div>
                    <h4 className="integration-workspace__table-title">Active Rule</h4>
                    <p className="integration-workspace__table-description">
                      {activePayload
                        ? `Amount: ₦${activePayload.amount.toLocaleString()} · Channel: ${activePayload.channel} · ${activePayload.enabled ? "Enabled" : "Disabled"}`
                        : "No rule published — using the system default."}
                    </p>
                  </div>
                  <div className="integration-workspace__active-rule-badges">
                    {detail.draft ? (
                      <Badge variant="info">Draft v{detail.draft.versionNumber}</Badge>
                    ) : null}
                    {detail.published ? (
                      <Badge variant="success">Live v{detail.published.versionNumber}</Badge>
                    ) : (
                      <Badge variant="neutral">Not Published</Badge>
                    )}
                  </div>
                </div>
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
                    "Edit the reward rule, publish approved changes, or restore a previous live version when needed.",
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
                    {detail ? "Edit Reward Rule" : "Set Up Reward Rule"}
                  </h4>
                  <p className="integration-workspace__editor-description">
                    Set the airtime reward amount and channel. Changes are saved as a draft until
                    you publish.
                  </p>
                </div>
              </div>

              <div className="integration-workspace__editor-body">
                <Input
                  id="reward-rule-title"
                  label="Rule Title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  hint="Use a clear operational name so admins know which rule is active."
                  {...(errors.title ? { error: errors.title } : {})}
                />

                <Input
                  id="reward-rule-amount"
                  label="Reward Amount (NGN)"
                  value={form.amount}
                  type="number"
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  hint="The airtime value (in naira) awarded to the learner when the rule fires."
                  {...(errors.amount ? { error: errors.amount } : {})}
                />

                <Select
                  id="reward-rule-channel"
                  label="Reward Channel"
                  value={form.channel}
                  options={CHANNEL_OPTIONS}
                  hint="The delivery channel used to issue the reward."
                  onChange={(value) => setForm({ ...form, channel: value as "airtime" })}
                />

                <div className="integration-workspace__toggle-field">
                  <span className="integration-workspace__toggle-label">Rule Enabled</span>
                  <Button
                    variant={form.enabled ? "primary" : "secondary"}
                    onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  >
                    {form.enabled ? "Enabled" : "Disabled"}
                  </Button>
                  <p className="integration-workspace__toggle-hint">
                    When disabled the rule will not fire even if published.
                  </p>
                </div>
              </div>

              <div className="integration-workspace__editor-footer">
                <Button variant="secondary" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button loading={isSubmitting} onClick={() => void saveDraft()}>
                  {detail ? "Update Draft" : "Save Draft"}
                </Button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
