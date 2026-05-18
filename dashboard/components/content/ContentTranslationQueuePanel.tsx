"use client";

import { useEffect, useMemo, useState } from "react";
import { TranslationCompletionDrawer } from "./TranslationCompletionDrawer";
import { TranslationRequestDrawer, type TranslationRequestDrawerFeedbackTone } from "./TranslationRequestDrawer";
import {
  TranslationRequestQueuePanel,
  type TranslationQueueRequestItem
} from "./TranslationRequestQueuePanel";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const TOKEN_KEY = "admin_config_jwt";
const OPEN_CONFIG_DOCUMENT_EVENT = "config-admin-open-document";

type ManagedOption = {
  value: string;
  label: string;
};

type TranslationMethod = "internal_request" | "integration_job";
type TranslationRequestRecord = {
  id: string;
  contentDocumentId: string;
  contentKey: string;
  contentTitle: string;
  sourceLanguage: string;
  method: TranslationMethod;
  targetLanguage: string;
  priority: string;
  note: string;
  status:
    | "pending"
    | "queued_for_integration"
    | "in_review"
    | "ready_for_review"
    | "completed"
    | "integration_failed";
  integrationState?: "queued" | "processing" | "completed" | "failed";
  integrationJobId?: string;
  completionNote?: string;
  completedAt?: string;
  completedBy?: string;
  reviewDraftVersionId?: string;
  requestedBy: string;
  requestedAt: string;
};

type TranslationBootstrapResponse = {
  actorRole: "admin" | "editor" | "viewer";
  requests: Array<TranslationRequestRecord>;
  contentItems: Array<{
    id: string;
    key: string;
    title: string;
  }>;
  methodOptions: Array<ManagedOption>;
  targetLanguageOptions: Array<ManagedOption>;
  priorityOptions: Array<ManagedOption>;
};

type FeedbackState = {
  tone: TranslationRequestDrawerFeedbackTone;
  text: string;
};

type FieldErrors = {
  method?: string;
  content?: string;
  targetLanguage?: string;
  priority?: string;
  note?: string;
};

type CompletionFieldErrors = {
  translatedContent?: string;
  completionNote?: string;
};

function mapStatusLabel(status: TranslationRequestRecord["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "queued_for_integration":
      return "Queued for Integration";
    case "in_review":
      return "In Review";
    case "ready_for_review":
      return "Ready for Review";
    case "completed":
      return "Completed";
    case "integration_failed":
      return "Integration Failed";
  }
}

function mapStatusVariant(
  status: TranslationRequestRecord["status"]
): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "pending":
      return "warning";
    case "queued_for_integration":
      return "info";
    case "in_review":
      return "info";
    case "ready_for_review":
      return "success";
    case "completed":
      return "success";
    case "integration_failed":
      return "danger";
  }
}

function fallbackMethodLabel(method: TranslationMethod) {
  return method === "integration_job" ? "Translate With Integration" : "Send Internal Request";
}

function mapMethodVariant(
  method: TranslationMethod
): "neutral" | "info" | "success" | "warning" | "danger" {
  return method === "integration_job" ? "info" : "neutral";
}

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ContentTranslationQueuePanel() {
  const [token, setToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [actorRole, setActorRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [completionDrawerOpen, setCompletionDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [drawerFeedback, setDrawerFeedback] = useState<FeedbackState | null>(null);
  const [completionFeedback, setCompletionFeedback] = useState<FeedbackState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [completionFieldErrors, setCompletionFieldErrors] = useState<CompletionFieldErrors>({});
  const [requests, setRequests] = useState<Array<TranslationRequestRecord>>([]);
  const [contentItems, setContentItems] = useState<Array<{ id: string; key: string; title: string }>>([]);
  const [methodOptions, setMethodOptions] = useState<Array<ManagedOption>>([]);
  const [targetLanguageOptions, setTargetLanguageOptions] = useState<Array<ManagedOption>>([]);
  const [priorityOptions, setPriorityOptions] = useState<Array<ManagedOption>>([]);
  const [methodValue, setMethodValue] = useState<TranslationMethod | "">("");
  const [contentValue, setContentValue] = useState("");
  const [targetLanguageValue, setTargetLanguageValue] = useState("");
  const [priorityValue, setPriorityValue] = useState("");
  const [noteValue, setNoteValue] = useState("");
  const [completionRequestId, setCompletionRequestId] = useState("");
  const [translatedContentValue, setTranslatedContentValue] = useState("");
  const [completionNoteValue, setCompletionNoteValue] = useState("");

  useEffect(() => {
    function syncTokenFromStorage() {
      const existing = window.localStorage.getItem(TOKEN_KEY) ?? "";
      setToken(existing.trim());
      setTokenReady(true);
    }

    syncTokenFromStorage();
    window.addEventListener("storage", syncTokenFromStorage);
    window.addEventListener("focus", syncTokenFromStorage);
    window.addEventListener("admin-config-token-updated", syncTokenFromStorage as EventListener);

    return () => {
      window.removeEventListener("storage", syncTokenFromStorage);
      window.removeEventListener("focus", syncTokenFromStorage);
      window.removeEventListener(
        "admin-config-token-updated",
        syncTokenFromStorage as EventListener
      );
    };
  }, []);

  async function request<T>(path: string, init?: RequestInit, accessToken = token): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init?.headers ?? {})
      }
    });

    const contentType = response.headers.get("content-type") ?? "";
    const rawBody = await response.text();
    const looksJson = contentType.toLowerCase().includes("application/json");
    const payload = looksJson && rawBody ? (JSON.parse(rawBody) as unknown) : rawBody;

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).message)
          : `Request failed with status ${response.status}.`;
      throw new Error(message);
    }

    if (!looksJson) {
      throw new Error(`Expected JSON response but received ${contentType || "unknown content type"}.`);
    }

    return payload as T;
  }

  async function refresh(accessToken = token) {
    if (!tokenReady) {
      return;
    }

    if (!accessToken) {
      setLoading(false);
      setFeedback({
        tone: "warning",
        text: "Save a valid settings access key above before requesting or reviewing translations."
      });
      return;
    }

    setLoading(true);
    try {
      let payload = await request<TranslationBootstrapResponse>(
        "/api/content/admin/translation-requests/bootstrap",
        undefined,
        accessToken
      );

      const missingManagedOptions =
        payload.methodOptions.length === 0 ||
        payload.targetLanguageOptions.length === 0 ||
        payload.priorityOptions.length === 0;
      if (missingManagedOptions && payload.actorRole === "admin") {
        await request(
          "/api/config/admin/category-seeds/ensure",
          {
            method: "POST",
            body: JSON.stringify({})
          },
          accessToken
        );
        payload = await request<TranslationBootstrapResponse>(
          "/api/content/admin/translation-requests/bootstrap",
          undefined,
          accessToken
        );
      }

      setActorRole(payload.actorRole);
      setRequests(payload.requests);
      setContentItems(payload.contentItems);
      setMethodOptions(payload.methodOptions);
      setTargetLanguageOptions(payload.targetLanguageOptions);
      setPriorityOptions(payload.priorityOptions);
      setMethodValue(
        (current) =>
          current ||
          (payload.methodOptions[0]?.value as TranslationMethod | undefined) ||
          "internal_request"
      );
      setContentValue((current) => current || payload.contentItems[0]?.id || "");
      setTargetLanguageValue((current) => current || payload.targetLanguageOptions[0]?.value || "");
      setPriorityValue((current) => current || payload.priorityOptions[0]?.value || "");
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token, tokenReady]);

  const queueItems = useMemo<Array<TranslationQueueRequestItem>>(
    () =>
      requests.map((request) => ({
        id: request.id,
        contentTitle: request.contentTitle,
        contentKey: request.contentKey,
        methodLabel:
          methodOptions.find((item) => item.value === request.method)?.label ??
          fallbackMethodLabel(request.method),
        methodVariant: mapMethodVariant(request.method),
        targetLanguageLabel:
          targetLanguageOptions.find((item) => item.value === request.targetLanguage)?.label ??
          request.targetLanguage,
        priorityLabel:
          priorityOptions.find((item) => item.value === request.priority)?.label ?? request.priority,
        statusLabel: mapStatusLabel(request.status),
        statusVariant: mapStatusVariant(request.status),
        requestedAtLabel: formatTimestamp(request.requestedAt),
        ...(request.completedAt
          ? { completedAtLabel: `Ready ${formatTimestamp(request.completedAt)}` }
          : {}),
        ...(request.completionNote?.trim()
          ? { completionNote: request.completionNote.trim() }
          : {}),
        canComplete: ["pending", "queued_for_integration", "in_review"].includes(request.status),
        canOpenDraft: request.status === "ready_for_review"
      })),
    [methodOptions, priorityOptions, requests, targetLanguageOptions]
  );
  const selectedCompletionRequest =
    requests.find((request) => request.id === completionRequestId) ?? null;
  const completionRequestBlockingMessage = !token.length
    ? "Save a valid settings access key above before completing translations."
    : actorRole === "viewer"
      ? "Your current access level can review the queue but cannot complete translations."
      : !selectedCompletionRequest
        ? "Choose a translation request before creating a review draft."
        : null;

  const requestBlockingMessage = !token.length
    ? "Save a valid settings access key above before requesting translations."
    : actorRole === "viewer"
      ? "Your current access level can review the queue but cannot create translation requests."
      : methodOptions.length === 0
        ? "Translation methods are not available yet. Ask an admin to review the managed options."
      : contentItems.length === 0
        ? "Create at least one content item before requesting a translation."
        : targetLanguageOptions.length === 0
          ? "Translation languages are not available yet. Ask an admin to review the managed options."
          : priorityOptions.length === 0
            ? "Translation priorities are not available yet. Ask an admin to review the managed options."
            : null;
  const canOpenRequestDrawer = !loading;
  const canSubmitRequest = requestBlockingMessage === null;
  const panelFeedback =
    feedback ?? (requestBlockingMessage && !loading ? { tone: "warning" as const, text: requestBlockingMessage } : null);

  function resetDrawerState() {
    setFieldErrors({});
    setDrawerFeedback(null);
    setNoteValue("");
  }

  function resetCompletionDrawerState() {
    setCompletionFieldErrors({});
    setCompletionFeedback(null);
    setCompletionRequestId("");
    setTranslatedContentValue("");
    setCompletionNoteValue("");
  }

  function validateForm() {
    const nextErrors: FieldErrors = {};

    if (!methodValue) {
      nextErrors.method = "Choose how this translation should be handled.";
    }

    if (!contentValue) {
      nextErrors.content = "Choose the content item that needs translation.";
    }

    if (!targetLanguageValue) {
      nextErrors.targetLanguage = "Choose the language you want this content translated into.";
    }

    if (!priorityValue) {
      nextErrors.priority = "Choose how urgent this request is.";
    }

    if (noteValue.trim().length > 1000) {
      nextErrors.note = "Keep the notes within 1000 characters.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function validateCompletionForm() {
    const nextErrors: CompletionFieldErrors = {};

    if (!translatedContentValue.trim()) {
      nextErrors.translatedContent =
        "Paste the translated content before saving this review draft.";
    } else if (translatedContentValue.trim().length > 20000) {
      nextErrors.translatedContent = "Keep the translated content within 20000 characters.";
    }

    if (completionNoteValue.trim().length > 1000) {
      nextErrors.completionNote = "Keep the completion note within 1000 characters.";
    }

    setCompletionFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    setDrawerFeedback(null);

    if (!validateForm()) {
      setDrawerFeedback({
        tone: "warning",
        text: "Review the highlighted fields before submitting this request."
      });
      return;
    }

    setSaving(true);
    try {
      const response = await request<{ request: TranslationRequestRecord }>(
        "/api/content/admin/translation-requests",
        {
          method: "POST",
          body: JSON.stringify({
            contentDocumentId: contentValue,
            method: methodValue,
            targetLanguage: targetLanguageValue,
            priority: priorityValue,
            note: noteValue.trim()
          })
        }
      );

      setRequests((current) => [response.request, ...current]);
      setDrawerOpen(false);
      resetDrawerState();
      setFeedback({
        tone: "success",
        text:
          methodValue === "integration_job"
            ? "Integration job queued and added to the translation queue."
            : "Translation request saved and added to the queue."
      });
    } catch (error) {
      setDrawerFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setSaving(false);
    }
  }

  function openCompletionDrawer(requestId: string) {
    const nextRequest = requests.find((request) => request.id === requestId);
    setCompletionRequestId(requestId);
    setCompletionFieldErrors({});
    setCompletionFeedback(null);
    setTranslatedContentValue("");
    setCompletionNoteValue(nextRequest?.completionNote ?? "");
    setCompletionDrawerOpen(true);
  }

  async function handleCompleteSubmit() {
    setCompletionFeedback(null);

    if (completionRequestBlockingMessage) {
      setCompletionFeedback({
        tone: "warning",
        text: completionRequestBlockingMessage
      });
      return;
    }

    if (!validateCompletionForm() || !selectedCompletionRequest) {
      setCompletionFeedback({
        tone: "warning",
        text: "Review the highlighted fields before saving the review draft."
      });
      return;
    }

    setCompleting(true);
    try {
      const response = await request<{ request: TranslationRequestRecord }>(
        `/api/content/admin/translation-requests/${selectedCompletionRequest.id}/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            translatedContent: translatedContentValue.trim(),
            completionNote: completionNoteValue.trim()
          })
        }
      );

      setRequests((current) =>
        current.map((item) => (item.id === response.request.id ? response.request : item))
      );
      setCompletionDrawerOpen(false);
      resetCompletionDrawerState();
      setFeedback({
        tone: "success",
        text: "Translation saved to a review draft. Open Content Draft to review and publish it."
      });
    } catch (error) {
      setCompletionFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setCompleting(false);
    }
  }

  function handleOpenDraft(requestId: string) {
    const targetRequest = requests.find((request) => request.id === requestId);
    if (!targetRequest) {
      setFeedback({
        tone: "warning",
        text: "The selected translation request could not be found."
      });
      return;
    }

    window.dispatchEvent(
      new CustomEvent(OPEN_CONFIG_DOCUMENT_EVENT, {
        detail: {
          namespace: "content",
          key: targetRequest.contentKey
        }
      })
    );
    setFeedback({
      tone: "success",
      text: `Opened ${targetRequest.contentTitle} in the content workspace for review.`
    });
  }

  return (
    <>
      <TranslationRequestQueuePanel
        requests={queueItems}
        loading={loading}
        feedback={panelFeedback}
        canRequest={canOpenRequestDrawer}
        onCompleteRequest={openCompletionDrawer}
        onOpenDraft={handleOpenDraft}
        onRequestTranslation={() => {
          resetDrawerState();
          if (requestBlockingMessage) {
            setDrawerFeedback({
              tone: "warning",
              text: requestBlockingMessage
            });
          }
          setDrawerOpen(true);
        }}
      />

      <TranslationRequestDrawer
        open={drawerOpen}
        methodValue={methodValue}
        contentValue={contentValue}
        targetLanguageValue={targetLanguageValue}
        priorityValue={priorityValue}
        noteValue={noteValue}
        methodOptions={methodOptions}
        contentOptions={contentItems.map((item) => ({
          value: item.id,
          label: `${item.title} - ${item.key}`
        }))}
        targetLanguageOptions={targetLanguageOptions}
        priorityOptions={priorityOptions}
        methodError={fieldErrors.method}
        contentError={fieldErrors.content}
        targetLanguageError={fieldErrors.targetLanguage}
        priorityError={fieldErrors.priority}
        noteError={fieldErrors.note}
        feedback={drawerFeedback}
        saving={saving}
        canSubmit={canSubmitRequest}
        submitLabel={methodValue === "integration_job" ? "Queue Integration" : "Send Request"}
        onMethodChange={(value) => setMethodValue(value as TranslationMethod)}
        onContentChange={setContentValue}
        onTargetLanguageChange={setTargetLanguageValue}
        onPriorityChange={setPriorityValue}
        onNoteChange={setNoteValue}
        onClose={() => {
          setDrawerOpen(false);
          resetDrawerState();
        }}
        onSubmit={() => void handleSubmit()}
      />

      <TranslationCompletionDrawer
        open={completionDrawerOpen}
        contentTitle={selectedCompletionRequest?.contentTitle ?? ""}
        contentKey={selectedCompletionRequest?.contentKey ?? ""}
        methodLabel={
          selectedCompletionRequest
            ? (methodOptions.find((item) => item.value === selectedCompletionRequest.method)?.label ??
              fallbackMethodLabel(selectedCompletionRequest.method))
            : ""
        }
        targetLanguageLabel={
          selectedCompletionRequest
            ? (targetLanguageOptions.find(
                (item) => item.value === selectedCompletionRequest.targetLanguage
              )?.label ?? selectedCompletionRequest.targetLanguage)
            : ""
        }
        translatedContentValue={translatedContentValue}
        completionNoteValue={completionNoteValue}
        translatedContentError={completionFieldErrors.translatedContent}
        completionNoteError={completionFieldErrors.completionNote}
        feedback={completionFeedback}
        saving={completing}
        canSubmit={completionRequestBlockingMessage === null}
        onTranslatedContentChange={setTranslatedContentValue}
        onCompletionNoteChange={setCompletionNoteValue}
        onClose={() => {
          setCompletionDrawerOpen(false);
          resetCompletionDrawerState();
        }}
        onSubmit={() => void handleCompleteSubmit()}
      />
    </>
  );
}
