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

type MilestoneFormRow = {
  /** "2", "5", … or the literal "all" (= every published module). */
  modulesCompleted: string;
  amount: string;
  label: string;
};

type RewardRulesFormState = {
  title: string;
  amount: string;
  channel: "airtime";
  enabled: boolean;
  milestones: MilestoneFormRow[];
};

type RewardMilestonePayload = {
  modulesCompleted: number | "all";
  amount: number;
  label?: string;
};

type RewardRulesPayload = {
  kind: "reward_rules";
  amount: number;
  channel: "airtime";
  enabled: boolean;
  /** When non-empty, milestone payouts replace the flat per-module amount. */
  milestones?: RewardMilestonePayload[];
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
    enabled: true,
    milestones: []
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
    enabled: candidatePayload.enabled,
    milestones: (candidatePayload.milestones ?? []).map((milestone) => ({
      modulesCompleted: String(milestone.modulesCompleted),
      amount: String(milestone.amount),
      label: milestone.label ?? ""
    }))
  };
}

function parseThreshold(raw: string): number | "all" | null {
  const value = raw.trim().toLowerCase();
  if (value === "all") return "all";
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 ? numeric : null;
}

function validateForm(form: RewardRulesFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) {
    errors.title = "Give this reward rule a clear title.";
  }
  if (!(Number(form.amount) > 0)) {
    errors.amount = "Enter a reward amount greater than zero.";
  }
  form.milestones.forEach((milestone, index) => {
    if (parseThreshold(milestone.modulesCompleted) === null) {
      errors[`milestone-${index}-threshold`] = 'Enter a whole number of modules, or "all".';
    }
    if (!(Number(milestone.amount) > 0)) {
      errors[`milestone-${index}-amount`] = "Enter an amount greater than zero.";
    }
  });
  return errors;
}

function serializePayload(form: RewardRulesFormState): RewardRulesPayload {
  const payload: RewardRulesPayload = {
    kind: "reward_rules",
    amount: Number(form.amount),
    channel: form.channel,
    enabled: form.enabled
  };
  if (form.milestones.length > 0) {
    payload.milestones = form.milestones.map((milestone) => {
      const threshold = parseThreshold(milestone.modulesCompleted) ?? 1;
      const entry: RewardMilestonePayload = {
        modulesCompleted: threshold,
        amount: Number(milestone.amount)
      };
      if (milestone.label.trim()) entry.label = milestone.label.trim();
      return entry;
    });
  }
  return payload;
}

function describeMilestones(milestones: RewardMilestonePayload[]): string {
  return milestones
    .map(
      (milestone) =>
        `₦${milestone.amount.toLocaleString()} @ ${
          milestone.modulesCompleted === "all" ? "all modules" : `${milestone.modulesCompleted} modules`
        }`
    )
    .join(", ");
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
                        ? activePayload.milestones && activePayload.milestones.length > 0
                          ? `Milestones: ${describeMilestones(activePayload.milestones)} · Channel: ${activePayload.channel} · ${activePayload.enabled ? "Enabled" : "Disabled"}`
                          : `Per module: ₦${activePayload.amount.toLocaleString()} · Channel: ${activePayload.channel} · ${activePayload.enabled ? "Enabled" : "Disabled"}`
                        : "No rule published - using the system default."}
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
                  label="Per-Module Amount (NGN)"
                  value={form.amount}
                  type="number"
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  hint="Flat airtime value per completed module. IGNORED while any milestone rows exist below."
                  {...(errors.amount ? { error: errors.amount } : {})}
                />

                <div className="reward-milestones">
                  <div className="reward-milestones__header">
                    <span className="integration-workspace__toggle-label">Milestone Payouts</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setForm({
                          ...form,
                          milestones: [
                            ...form.milestones,
                            { modulesCompleted: "", amount: "", label: "" }
                          ]
                        })
                      }
                    >
                      Add Milestone
                    </Button>
                  </div>
                  <p className="integration-workspace__toggle-hint">
                    With milestones, learners are paid when their COMPLETED MODULE COUNT reaches
                    each threshold (in any module order) instead of per module. Use a number
                    (e.g. 2) or &quot;all&quot; for every published module. Leave the list empty
                    to keep flat per-module payouts.
                  </p>
                  {form.milestones.map((milestone, index) => (
                    <div className="reward-milestone-row" key={index}>
                      <Input
                        id={`reward-milestone-${index}-threshold`}
                        label="Modules Completed"
                        value={milestone.modulesCompleted}
                        placeholder='e.g. 2 or "all"'
                        onChange={(event) => {
                          const next = [...form.milestones];
                          next[index] = { ...milestone, modulesCompleted: event.target.value };
                          setForm({ ...form, milestones: next });
                        }}
                        {...(errors[`milestone-${index}-threshold`]
                          ? { error: errors[`milestone-${index}-threshold`] }
                          : {})}
                      />
                      <Input
                        id={`reward-milestone-${index}-amount`}
                        label="Amount (NGN)"
                        type="number"
                        value={milestone.amount}
                        onChange={(event) => {
                          const next = [...form.milestones];
                          next[index] = { ...milestone, amount: event.target.value };
                          setForm({ ...form, milestones: next });
                        }}
                        {...(errors[`milestone-${index}-amount`]
                          ? { error: errors[`milestone-${index}-amount`] }
                          : {})}
                      />
                      <Input
                        id={`reward-milestone-${index}-label`}
                        label="Label (optional)"
                        value={milestone.label}
                        placeholder="e.g. First two modules"
                        onChange={(event) => {
                          const next = [...form.milestones];
                          next[index] = { ...milestone, label: event.target.value };
                          setForm({ ...form, milestones: next });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove milestone ${index + 1}`}
                        onClick={() =>
                          setForm({
                            ...form,
                            milestones: form.milestones.filter((_, i) => i !== index)
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>

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
                  {/* GAP-H3: this button is a toggle, so expose its on/off state
                      to assistive tech - the visible label alone doesn't tell a
                      screen reader that it is a pressed/unpressed control. */}
                  <Button
                    variant={form.enabled ? "primary" : "secondary"}
                    aria-pressed={form.enabled}
                    aria-label={`Rule enabled: ${form.enabled ? "on" : "off"}`}
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
