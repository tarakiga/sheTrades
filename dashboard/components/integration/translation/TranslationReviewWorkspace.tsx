"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Badge, Button, Card, ConstraintMeter, EmptyState, Input, Select, Table, Textarea } from "../../ui";
import {
  ADMIN_CONFIG_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../../lib/admin-config-auth";
import {
  WHATSAPP_LIMITS,
  composeLessonBody,
  composeQuizQuestion,
  type WhatsAppLang
} from "../../../lib/whatsapp-constraints";

/**
 * Types mirror backend/src/translation/draft-store.ts (DraftRow), extract.ts
 * (DraftPayload), and runner.ts (RunReport) — see routes/translation.ts for the
 * /api/admin/translation surface these map to.
 */
export type TranslationLanguage = "pcm" | "ig";

export type TranslationDraftStatus = "machine_draft" | "in_review" | "approved" | "promoted";

export type TranslationRunSummary = {
  translated: number;
  failed: number;
  overBudget: number;
} | null;

export type TranslationQuizItem = {
  question?: string;
  options: Array<string | null>;
};

export type TranslationDraftPayload = {
  title?: string;
  body?: string;
  quiz: TranslationQuizItem[];
};

export type TranslationDraftRow = {
  contentDocumentId: string;
  contentKey: string;
  targetLanguage: TranslationLanguage;
  payload: TranslationDraftPayload;
  runSummary: TranslationRunSummary;
  status: TranslationDraftStatus;
  assignee: string | null;
  sourceHash: string;
  /** Set by the list endpoint when the live English has changed since this was
   * translated — promotion will refuse until it is re-run. */
  stale?: boolean;
  updatedAt: string;
  promotedAt: string | null;
};

export type TranslationLessonRef = {
  id: string;
  key: string;
  title: string;
};

export type TranslationRunReport = {
  language: TranslationLanguage;
  attempted: number;
  translatedLessons: number;
  skipped: Array<{ id: string; reason: string }>;
  stoppedForQuota: boolean;
};

export type TranslationFeedback = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "purple" | "teal";

export function draftKey(row: Pick<TranslationDraftRow, "contentDocumentId" | "targetLanguage">) {
  return `${row.contentDocumentId}::${row.targetLanguage}`;
}

export function languageLabel(language: TranslationLanguage) {
  return language === "pcm" ? "Pidgin" : "Igbo";
}

export function statusLabel(status: TranslationDraftStatus) {
  switch (status) {
    case "machine_draft":
      return "Machine Draft";
    case "in_review":
      return "In Review";
    case "approved":
      return "Approved";
    case "promoted":
      return "Promoted";
  }
}

export function statusBadgeVariant(status: TranslationDraftStatus): BadgeVariant {
  switch (status) {
    case "machine_draft":
      return "neutral";
    case "in_review":
      return "info";
    case "approved":
      return "warning";
    case "promoted":
      return "success";
  }
}

function clonePayload(payload: TranslationDraftPayload): TranslationDraftPayload {
  return {
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.body !== undefined ? { body: payload.body } : {}),
    quiz: (payload.quiz ?? []).map((item) => ({
      ...(item.question !== undefined ? { question: item.question } : {}),
      options: [...(item.options ?? [])]
    }))
  };
}

function hasFlags(runSummary: TranslationRunSummary) {
  return Boolean(runSummary && (runSummary.overBudget > 0 || runSummary.failed > 0));
}

/**
 * Lesson checklist + language choice + run actions. Presentational only — no
 * fetch logic — so the /previews/components harness can drive it with fixture
 * data exactly like TranslationSettingsForm.
 */
export function TranslationRunPanel({
  lessons,
  selectedLessonIds,
  onToggleLesson,
  language,
  onLanguageChange,
  onRunSelected,
  onRunAll,
  running,
  report,
  runError
}: {
  lessons: TranslationLessonRef[];
  selectedLessonIds: string[];
  onToggleLesson: (id: string) => void;
  language: TranslationLanguage;
  onLanguageChange: (language: TranslationLanguage) => void;
  onRunSelected: () => void;
  onRunAll: () => void;
  running: boolean;
  report: TranslationRunReport | null;
  runError: string;
}) {
  return (
    <Card
      title="Run Translation"
      description="Pick a target language, choose one or more lessons (or run every published lesson), then translate. Machine drafts land below for review."
    >
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Select
          id="translation-run-language"
          label="Target Language"
          value={language}
          disabled={running}
          options={[
            { value: "pcm", label: "Pidgin" },
            { value: "ig", label: "Igbo" }
          ]}
          onChange={(next) => onLanguageChange(next as TranslationLanguage)}
        />

        {lessons.length === 0 ? (
          <EmptyState
            title="No published lessons"
            description="Publish lesson content before running a translation."
          />
        ) : (
          <fieldset style={{ display: "grid", gap: "var(--space-2)", border: "none", padding: 0, margin: 0 }}>
            <legend style={{ padding: 0, marginBottom: "var(--space-2)" }}>Lessons</legend>
            <div
              style={{
                display: "grid",
                gap: "var(--space-2)",
                maxHeight: "260px",
                overflowY: "auto"
              }}
            >
              {lessons.map((lesson) => (
                <label
                  key={lesson.id}
                  style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLessonIds.includes(lesson.id)}
                    disabled={running}
                    onChange={() => onToggleLesson(lesson.id)}
                  />
                  <span>{lesson.title}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="preview-row">
          <Button
            onClick={onRunSelected}
            disabled={running || selectedLessonIds.length === 0}
            loading={running}
          >
            Translate Selected ({selectedLessonIds.length})
          </Button>
          <Button variant="secondary" onClick={onRunAll} disabled={running} loading={running}>
            Translate All
          </Button>
        </div>

        {runError ? <Badge variant="danger">{runError}</Badge> : null}

        {report ? (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            <div className="preview-row">
              <Badge variant="info">Attempted: {report.attempted}</Badge>
              <Badge variant="success">Translated: {report.translatedLessons}</Badge>
              <Badge variant={report.skipped.length > 0 ? "warning" : "neutral"}>
                Skipped: {report.skipped.length}
              </Badge>
            </div>
            {report.stoppedForQuota ? (
              <Badge variant="danger">
                Daily translation quota reached — re-run later to continue with the remaining
                lessons.
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

type DraftTableRow = {
  rowKey: string;
  lessonTitle: string;
  languageLabel: string;
  statusLabel: string;
  flagsLabel: string;
  raw: TranslationDraftRow;
};

/** Draft list. Presentational — selection and data all come from props. */
export function TranslationDraftTable({
  drafts,
  lessons,
  selectedKey,
  onSelectDraft
}: {
  drafts: TranslationDraftRow[];
  lessons: TranslationLessonRef[];
  selectedKey: string | null;
  onSelectDraft: (key: string) => void;
}) {
  const rows: DraftTableRow[] = drafts.map((draft) => {
    const lesson = lessons.find((item) => item.id === draft.contentDocumentId);
    return {
      rowKey: draftKey(draft),
      lessonTitle: lesson?.title ?? draft.contentKey,
      languageLabel: languageLabel(draft.targetLanguage),
      statusLabel: statusLabel(draft.status),
      flagsLabel: hasFlags(draft.runSummary) ? "Needs attention" : "-",
      raw: draft
    };
  });

  return (
    <Card title="Drafts" description="Translated lessons awaiting review, approval, or promotion.">
      <Table
        emptyMessage="Run a translation above to generate drafts."
        columns={[
          {
            key: "lessonTitle",
            header: "Lesson",
            render: (value, row) => (
              <div>
                <div>{String(value)}</div>
                <span style={{ color: "var(--color-neutral-500)", fontSize: "var(--font-size-xs)" }}>
                  {row.raw.contentKey}
                </span>
              </div>
            )
          },
          {
            key: "languageLabel",
            header: "Language",
            render: (value) => <Badge variant="neutral">{String(value)}</Badge>
          },
          {
            key: "statusLabel",
            header: "Status",
            render: (value, row) => <Badge variant={statusBadgeVariant(row.raw.status)}>{String(value)}</Badge>
          },
          {
            key: "flagsLabel",
            header: "Flags",
            render: (value, row) => (
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <Badge variant={hasFlags(row.raw.runSummary) ? "danger" : "neutral"}>{String(value)}</Badge>
                {row.raw.stale ? <Badge variant="warning">English changed</Badge> : null}
              </div>
            )
          },
          {
            key: "rowKey",
            header: "Actions",
            render: (value) => (
              <Button
                size="sm"
                variant={selectedKey === value ? "primary" : "secondary"}
                onClick={() => onSelectDraft(String(value))}
              >
                {selectedKey === value ? "Reviewing" : "Review"}
              </Button>
            )
          }
        ]}
        rows={rows}
      />
    </Card>
  );
}

/**
 * Review panel for a single draft: editable fields, each with the same
 * ConstraintMeter gauge used by the content editor, so the reviewer sees the
 * identical green/yellow/red feedback. Presentational — owns only the local
 * edit buffer (reset whenever a different draft is selected); save/approve/
 * promote are all delegated to the caller.
 *
 * The English source (fetched with the draft) is shown read-only beside each
 * field so a reviewer can translate in place — a field that failed translation
 * is blank, and without the source they would have to hunt down the lesson.
 * Any field whose English source exists but whose translation is empty is
 * flagged "needs translation", uniformly across title/body/question/options.
 */
/** Read-only English reference shown beneath a translation field. */
function EnglishRef({ text }: { text: string | null | undefined }) {
  if (!text || !text.trim()) return null;
  return (
    <p
      style={{
        margin: 0,
        color: "var(--color-neutral-500)",
        fontSize: "var(--font-size-xs)",
        whiteSpace: "pre-wrap"
      }}
    >
      <strong>English:</strong> {text}
    </p>
  );
}

export function TranslationDraftReviewPanel({
  draft,
  source,
  lessonTitle,
  onSave,
  onApprove,
  onPromote,
  saving,
  approving,
  promoting,
  feedback
}: {
  draft: TranslationDraftRow;
  /** The lesson's English strings, for reference. Best-effort — may be null. */
  source: TranslationDraftPayload | null;
  lessonTitle: string;
  onSave: (payload: TranslationDraftPayload) => void;
  onApprove: () => void;
  onPromote: () => void;
  saving: boolean;
  approving: boolean;
  promoting: boolean;
  feedback: TranslationFeedback | null;
}) {
  const lang = draft.targetLanguage as WhatsAppLang;
  const [working, setWorking] = useState<TranslationDraftPayload>(() => clonePayload(draft.payload));

  useEffect(() => {
    setWorking(clonePayload(draft.payload));
    // Re-sync the local edit buffer whenever a different draft (or a fresher
    // copy of the same draft) is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.contentDocumentId, draft.targetLanguage, draft.updatedAt]);

  function updateTitle(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setWorking((current) => ({ ...current, title: value }));
  }

  function updateBody(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setWorking((current) => ({ ...current, body: value }));
  }

  function updateQuestion(qi: number, event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setWorking((current) => ({
      ...current,
      quiz: current.quiz.map((item, index) => (index === qi ? { ...item, question: value } : item))
    }));
  }

  function updateOption(qi: number, oi: number, event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setWorking((current) => ({
      ...current,
      quiz: current.quiz.map((item, index) => {
        if (index !== qi) return item;
        return {
          ...item,
          options: item.options.map((opt, optIndex) => (optIndex === oi ? value : opt))
        };
      })
    }));
  }

  const idPrefix = `translation-review-${draft.contentDocumentId}-${draft.targetLanguage}`;
  const titleValue = working.title ?? "";
  const bodyValue = working.body ?? "";
  const bodyMetrics = composeLessonBody(titleValue, bodyValue, lang);

  // A field needs the reviewer's attention when the lesson HAS English for it
  // but the machine produced nothing (failed or not attempted). This covers
  // failed options (null), omitted body/title/question, and any empty field —
  // uniformly, from the source rather than the draft's field-by-field shape.
  const needsTranslation = (src: string | null | undefined, value: string) =>
    Boolean(src && src.trim().length > 0) && value.trim().length === 0;
  const fieldLabel = (base: string, src: string | null | undefined, value: string) =>
    needsTranslation(src, value) ? `${base} — needs translation` : base;

  const canSave = draft.status === "machine_draft" || draft.status === "in_review";
  const canApprove = draft.status === "in_review";
  const canPromote = draft.status === "approved";

  return (
    <Card
      title={`Review: ${lessonTitle}`}
      description={`Translated into ${languageLabel(draft.targetLanguage)}. The English source is shown under each field — translate any field marked "needs translation" in place, and watch each meter below.`}
    >
      <div style={{ display: "grid", gap: "var(--space-6)" }}>
        <div className="preview-row">
          <Badge variant={statusBadgeVariant(draft.status)}>{statusLabel(draft.status)}</Badge>
          {draft.assignee ? <Badge variant="neutral">Assignee: {draft.assignee}</Badge> : null}
          {draft.runSummary ? (
            <Badge variant={hasFlags(draft.runSummary) ? "danger" : "success"}>
              {draft.runSummary.translated} translated · {draft.runSummary.failed} failed ·{" "}
              {draft.runSummary.overBudget} over budget
            </Badge>
          ) : null}
        </div>

        {feedback ? <Badge variant={feedback.tone}>{feedback.text}</Badge> : null}

        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <Input
            id={`${idPrefix}-title`}
            label={fieldLabel("Title", source?.title, titleValue)}
            value={titleValue}
            disabled={!canSave}
            onChange={updateTitle}
          />
          <EnglishRef text={source?.title} />
          <ConstraintMeter
            label="Title"
            used={titleValue.length}
            limit={WHATSAPP_LIMITS.listRowTitle}
            overflow="truncate"
          />
        </div>

        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <Textarea
            id={`${idPrefix}-body`}
            label={fieldLabel("Lesson Body", source?.body, bodyValue)}
            value={bodyValue}
            rows={5}
            disabled={!canSave}
            onChange={updateBody}
          />
          <EnglishRef text={source?.body} />
          <ConstraintMeter
            label="Lesson body"
            used={bodyMetrics.total}
            systemChars={bodyMetrics.systemChars}
            limit={bodyMetrics.limit}
            overflow="reject"
          />
        </div>

        {working.quiz.map((item, qi) => {
          const questionValue = item.question ?? "";
          const optionValues = item.options.map((option) => option ?? "");
          const questionMetrics = composeQuizQuestion(questionValue, optionValues, lang);
          const sourceQuiz = source?.quiz?.[qi];

          return (
            <div
              key={qi}
              style={{
                display: "grid",
                gap: "var(--space-2)",
                borderTop: "1px solid var(--color-neutral-200)",
                paddingTop: "var(--space-4)"
              }}
            >
              <h4 style={{ margin: 0 }}>Question {qi + 1}</h4>
              <Input
                id={`${idPrefix}-q${qi}-question`}
                label={fieldLabel("Question", sourceQuiz?.question, questionValue)}
                value={questionValue}
                disabled={!canSave}
                onChange={(event) => updateQuestion(qi, event)}
              />
              <EnglishRef text={sourceQuiz?.question} />
              <ConstraintMeter
                label="Question"
                used={questionMetrics.total}
                systemChars={questionMetrics.systemChars}
                limit={questionMetrics.limit}
                overflow="reject"
              />

              {item.options.map((option, oi) => {
                const value = option ?? "";
                const sourceOption = sourceQuiz?.options?.[oi];
                return (
                  <div key={oi} style={{ display: "grid", gap: "var(--space-1)" }}>
                    <Input
                      id={`${idPrefix}-q${qi}-opt${oi}`}
                      label={fieldLabel(`Option ${oi + 1}`, sourceOption, value)}
                      value={value}
                      disabled={!canSave}
                      onChange={(event) => updateOption(qi, oi, event)}
                    />
                    <EnglishRef text={sourceOption} />
                    <ConstraintMeter
                      label={`Option ${oi + 1}`}
                      used={value.length}
                      limit={WHATSAPP_LIMITS.buttonTitle}
                      overflow="truncate"
                    />
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="preview-row">
          <Button onClick={() => onSave(working)} disabled={!canSave} loading={saving}>
            Save
          </Button>
          <Button variant="secondary" onClick={onApprove} disabled={!canApprove} loading={approving}>
            Approve
          </Button>
          <Button variant="secondary" onClick={onPromote} disabled={!canPromote} loading={promoting}>
            Promote
          </Button>
        </div>
        <p style={{ margin: 0, color: "var(--color-neutral-500)", fontSize: "var(--font-size-sm)" }}>
          {canPromote
            ? "Approved — ready to promote into live content."
            : canApprove
              ? "This draft is In Review. Approve it to unlock Promote."
              : canSave
                ? "Save to move this machine draft into In Review before it can be approved."
                : `This draft is ${statusLabel(draft.status).toLowerCase()} and can no longer be edited here.`}
        </p>
      </div>
    </Card>
  );
}

/**
 * Smart wrapper: owns the admin token (same pattern as
 * IntegrationTranslationWorkspace — getStoredAdminConfigToken +
 * ADMIN_CONFIG_TOKEN_UPDATED_EVENT) and the fetch calls against
 * /api/admin/translation. Renders the presentational pieces above.
 */
export function TranslationReviewWorkspace() {
  const [token, setToken] = useState("");
  const [lessons, setLessons] = useState<TranslationLessonRef[]>([]);
  const [drafts, setDrafts] = useState<TranslationDraftRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [runLanguage, setRunLanguage] = useState<TranslationLanguage>("pcm");
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runReport, setRunReport] = useState<TranslationRunReport | null>(null);
  const [runError, setRunError] = useState("");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reviewSource, setReviewSource] = useState<TranslationDraftPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<TranslationFeedback | null>(null);

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
      setLessons([]);
      setDrafts([]);
      setLoadError("Save an access key in Integration before running or reviewing translations.");
      return;
    }

    try {
      setIsLoading(true);
      setLoadError("");
      const response = await request<{ drafts: TranslationDraftRow[]; lessons: TranslationLessonRef[] }>(
        "/api/admin/translation",
        undefined,
        accessToken
      );
      setDrafts(response.drafts ?? []);
      setLessons(response.lessons ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
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

  function toggleLesson(id: string) {
    setSelectedLessonIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]
    );
  }

  async function selectDraft(key: string) {
    setSelectedKey(key);
    // A stale success/error banner from the previously reviewed draft should
    // not carry over and be misread as feedback for the newly selected one.
    setActionFeedback(null);
    setReviewSource(null);
    const row = drafts.find((r) => draftKey(r) === key);
    if (!row) return;
    try {
      // Fetch the single draft to get its English source for side-by-side review.
      const response = await request<{
        draft: TranslationDraftRow;
        source: TranslationDraftPayload | null;
      }>(
        `/api/admin/translation/${encodeURIComponent(row.contentDocumentId)}/${encodeURIComponent(
          row.targetLanguage
        )}`
      );
      setReviewSource(response.source ?? null);
    } catch {
      // Source is best-effort — the panel still works without it (fields just
      // won't show the English reference).
      setReviewSource(null);
    }
  }

  async function runTranslation(documentIds: string[] | "all") {
    try {
      setRunning(true);
      setRunError("");
      const response = await request<{ report: TranslationRunReport }>("/api/admin/translation/run", {
        method: "POST",
        body: JSON.stringify({ documentIds, language: runLanguage })
      });
      setRunReport(response.report);
      await refresh();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  const selectedDraft = useMemo(
    () => drafts.find((row) => draftKey(row) === selectedKey) ?? null,
    [drafts, selectedKey]
  );
  const selectedLessonTitle = useMemo(() => {
    if (!selectedDraft) return "";
    return lessons.find((lesson) => lesson.id === selectedDraft.contentDocumentId)?.title ?? selectedDraft.contentKey;
  }, [lessons, selectedDraft]);

  function applyDraftUpdate(next: TranslationDraftRow) {
    setDrafts((current) => current.map((row) => (draftKey(row) === draftKey(next) ? next : row)));
  }

  async function saveDraft(payload: TranslationDraftPayload) {
    if (!selectedDraft) return;
    try {
      setSaving(true);
      setActionFeedback(null);
      const response = await request<{ draft: TranslationDraftRow }>(
        `/api/admin/translation/${encodeURIComponent(selectedDraft.contentDocumentId)}/${encodeURIComponent(
          selectedDraft.targetLanguage
        )}`,
        { method: "PUT", body: JSON.stringify({ payload }) }
      );
      applyDraftUpdate(response.draft);
      setActionFeedback({ tone: "success", text: "Draft saved and moved to In Review." });
    } catch (error) {
      setActionFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setSaving(false);
    }
  }

  async function approveDraft() {
    if (!selectedDraft) return;
    try {
      setApproving(true);
      setActionFeedback(null);
      const response = await request<{ draft: TranslationDraftRow }>(
        `/api/admin/translation/${encodeURIComponent(selectedDraft.contentDocumentId)}/${encodeURIComponent(
          selectedDraft.targetLanguage
        )}/approve`,
        { method: "POST" }
      );
      applyDraftUpdate(response.draft);
      setActionFeedback({ tone: "success", text: "Draft approved." });
    } catch (error) {
      setActionFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setApproving(false);
    }
  }

  async function promoteDraft() {
    if (!selectedDraft) return;
    try {
      setPromoting(true);
      setActionFeedback(null);
      await request(
        `/api/admin/translation/${encodeURIComponent(selectedDraft.contentDocumentId)}/${encodeURIComponent(
          selectedDraft.targetLanguage
        )}/promote`,
        { method: "POST" }
      );
      setActionFeedback({ tone: "success", text: "Translation promoted into live content." });
      await refresh();
    } catch (error) {
      setActionFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setPromoting(false);
    }
  }

  if (loadError) {
    return (
      <section className="integration-workspace">
        <EmptyState title="Access Required" description={loadError} />
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="integration-workspace">
        <div className="integration-workspace__loading">
          <Badge variant="info">Loading translation review data...</Badge>
        </div>
      </section>
    );
  }

  return (
    <section className="integration-workspace" style={{ display: "grid", gap: "var(--space-6)" }}>
      <header className="integration-workspace__header">
        <div>
          <h3 className="integration-workspace__title">Translation Review</h3>
          <p className="integration-workspace__description">
            Run machine translation for lessons, then review, edit, approve, and promote each
            language draft into live content.
          </p>
        </div>
      </header>

      <TranslationRunPanel
        lessons={lessons}
        selectedLessonIds={selectedLessonIds}
        onToggleLesson={toggleLesson}
        language={runLanguage}
        onLanguageChange={(language) => {
          setRunLanguage(language);
          setRunReport(null);
          setRunError("");
        }}
        onRunSelected={() => void runTranslation(selectedLessonIds)}
        onRunAll={() => void runTranslation("all")}
        running={running}
        report={runReport}
        runError={runError}
      />

      <TranslationDraftTable
        drafts={drafts}
        lessons={lessons}
        selectedKey={selectedKey}
        onSelectDraft={(key) => void selectDraft(key)}
      />

      {selectedDraft ? (
        <TranslationDraftReviewPanel
          draft={selectedDraft}
          source={reviewSource}
          lessonTitle={selectedLessonTitle}
          onSave={(payload) => void saveDraft(payload)}
          onApprove={() => void approveDraft()}
          onPromote={() => void promoteDraft()}
          saving={saving}
          approving={approving}
          promoting={promoting}
          feedback={actionFeedback}
        />
      ) : null}
    </section>
  );
}
