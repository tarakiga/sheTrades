"use client";

import { Badge, Button, Card, EmptyState, LoadingState } from "../ui";
import type { TranslationRequestDrawerFeedbackTone } from "./TranslationRequestDrawer";

export type TranslationQueueRequestItem = {
  id: string;
  contentTitle: string;
  contentKey: string;
  methodLabel: string;
  methodVariant: "neutral" | "info" | "success" | "warning" | "danger";
  targetLanguageLabel: string;
  priorityLabel: string;
  statusLabel: string;
  statusVariant: "neutral" | "info" | "success" | "warning" | "danger";
  requestedAtLabel: string;
  completedAtLabel?: string;
  completionNote?: string;
  canComplete: boolean;
  canOpenDraft: boolean;
};

export type TranslationRequestQueuePanelProps = {
  requests: Array<TranslationQueueRequestItem>;
  loading: boolean;
  canRequest: boolean;
  feedback?: {
    tone: TranslationRequestDrawerFeedbackTone;
    text: string;
  } | null;
  onRequestTranslation: () => void;
  onCompleteRequest: (requestId: string) => void;
  onOpenDraft: (requestId: string) => void;
};

function toneToBadgeVariant(tone: TranslationRequestDrawerFeedbackTone) {
  switch (tone) {
    case "success":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "danger":
      return "danger" as const;
  }
}

export function TranslationRequestQueuePanel({
  requests,
  loading,
  canRequest,
  feedback,
  onRequestTranslation,
  onCompleteRequest,
  onOpenDraft
}: TranslationRequestQueuePanelProps) {
  const description =
    requests.length > 0
      ? "Track submitted translation requests and keep an eye on what needs attention next."
      : "Request translation work for any managed content item and keep the queue visible in one place.";

  return (
    <Card
      title="Translation Queue"
      description={description}
      actions={
        <Button variant="secondary" onClick={onRequestTranslation} disabled={!canRequest}>
          Request Translation
        </Button>
      }
    >
      <div className="translation-queue-panel">
        {feedback ? (
          <div className="translation-queue-panel__feedback" role="status">
            <Badge variant={toneToBadgeVariant(feedback.tone)}>{feedback.text}</Badge>
          </div>
        ) : null}

        {loading ? (
          <LoadingState label="Loading translation requests..." />
        ) : requests.length === 0 ? (
          <EmptyState
            title="No Translation Requests Yet"
            description="Use Request Translation to send a content item into the queue for follow-up."
          />
        ) : (
          <div className="translation-queue-panel__list" role="list">
            {requests.map((request) => (
              <article key={request.id} className="translation-queue-panel__item" role="listitem">
                <div className="translation-queue-panel__item-header">
                  <div>
                    <h4 className="translation-queue-panel__item-title">{request.contentTitle}</h4>
                    <p className="translation-queue-panel__item-key">{request.contentKey}</p>
                  </div>
                  <div className="translation-queue-panel__badges">
                    <Badge variant={request.methodVariant}>{request.methodLabel}</Badge>
                    <Badge variant={request.statusVariant}>{request.statusLabel}</Badge>
                  </div>
                </div>
                <div className="translation-queue-panel__meta">
                  <span>{request.targetLanguageLabel}</span>
                  <span>{request.priorityLabel}</span>
                  <span>{request.requestedAtLabel}</span>
                  {request.completedAtLabel ? <span>{request.completedAtLabel}</span> : null}
                </div>
                {request.completionNote ? (
                  <p className="translation-queue-panel__note">{request.completionNote}</p>
                ) : null}
                {request.canComplete || request.canOpenDraft ? (
                  <div className="translation-queue-panel__actions">
                    {request.canComplete ? (
                      <Button variant="ghost" size="sm" onClick={() => onCompleteRequest(request.id)}>
                        Complete Translation
                      </Button>
                    ) : null}
                    {request.canOpenDraft ? (
                      <Button variant="secondary" size="sm" onClick={() => onOpenDraft(request.id)}>
                        Open Content Draft
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
