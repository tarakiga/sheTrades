"use client";

import { Button, SideDrawer, Textarea } from "../ui";
import type { TranslationRequestDrawerFeedbackTone } from "./TranslationRequestDrawer";

export type TranslationCompletionDrawerProps = {
  open: boolean;
  contentTitle: string;
  contentKey: string;
  methodLabel: string;
  targetLanguageLabel: string;
  translatedContentValue: string;
  completionNoteValue: string;
  translatedContentError?: string | undefined;
  completionNoteError?: string | undefined;
  feedback?: {
    tone: TranslationRequestDrawerFeedbackTone;
    text: string;
  } | null;
  saving: boolean;
  canSubmit: boolean;
  onTranslatedContentChange: (value: string) => void;
  onCompletionNoteChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function TranslationCompletionDrawer({
  open,
  contentTitle,
  contentKey,
  methodLabel,
  targetLanguageLabel,
  translatedContentValue,
  completionNoteValue,
  translatedContentError,
  completionNoteError,
  feedback,
  saving,
  canSubmit,
  onTranslatedContentChange,
  onCompletionNoteChange,
  onClose,
  onSubmit
}: TranslationCompletionDrawerProps) {
  return (
    <SideDrawer
      open={open}
      title="Complete Translation"
      description="Add the finished translation so the system can save it as a draft for review before publishing."
      onClose={onClose}
      footerActions={
        <div className="translation-request-drawer__footer">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={saving} disabled={!canSubmit}>
            Save Review Draft
          </Button>
        </div>
      }
    >
      <div className="translation-request-drawer">
        {feedback ? (
          <div
            className={`translation-request-drawer__feedback translation-request-drawer__feedback--${feedback.tone}`}
            role="status"
          >
            {feedback.text}
          </div>
        ) : null}

        <section className="translation-completion-drawer__summary" aria-label="Translation request summary">
          <div className="translation-completion-drawer__summary-row">
            <span className="translation-completion-drawer__summary-label">Content</span>
            <div>
              <p className="translation-completion-drawer__summary-value">{contentTitle}</p>
              <p className="translation-completion-drawer__summary-key">{contentKey}</p>
            </div>
          </div>
          <div className="translation-completion-drawer__summary-grid">
            <div className="translation-completion-drawer__summary-card">
              <span className="translation-completion-drawer__summary-label">Method</span>
              <p className="translation-completion-drawer__summary-value">{methodLabel}</p>
            </div>
            <div className="translation-completion-drawer__summary-card">
              <span className="translation-completion-drawer__summary-label">Target Language</span>
              <p className="translation-completion-drawer__summary-value">{targetLanguageLabel}</p>
            </div>
          </div>
        </section>

        <div className="translation-request-drawer__field">
          <Textarea
            id="translation-completion-content"
            label="Translated Content"
            rows={8}
            value={translatedContentValue}
            hint="Paste the final translated copy exactly as it should appear in the draft review."
            {...(translatedContentError ? { error: translatedContentError } : {})}
            onChange={(event) => onTranslatedContentChange(event.target.value)}
          />
        </div>

        <div className="translation-request-drawer__field">
          <Textarea
            id="translation-completion-note"
            label="Completion Note"
            rows={4}
            value={completionNoteValue}
            hint="Optional context for reviewers, such as tone notes, provider output details, or QA reminders."
            {...(completionNoteError ? { error: completionNoteError } : {})}
            onChange={(event) => onCompletionNoteChange(event.target.value)}
          />
        </div>
      </div>
    </SideDrawer>
  );
}
