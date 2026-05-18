"use client";

import { Button, Select, SideDrawer, Textarea } from "../ui";

export type TranslationRequestDrawerOption = {
  value: string;
  label: string;
};

export type TranslationRequestDrawerFeedbackTone = "success" | "warning" | "danger";

export type TranslationRequestDrawerProps = {
  open: boolean;
  methodValue: string;
  contentValue: string;
  targetLanguageValue: string;
  priorityValue: string;
  noteValue: string;
  methodOptions: Array<TranslationRequestDrawerOption>;
  contentOptions: Array<TranslationRequestDrawerOption>;
  targetLanguageOptions: Array<TranslationRequestDrawerOption>;
  priorityOptions: Array<TranslationRequestDrawerOption>;
  methodError?: string | undefined;
  contentError?: string | undefined;
  targetLanguageError?: string | undefined;
  priorityError?: string | undefined;
  noteError?: string | undefined;
  feedback?: {
    tone: TranslationRequestDrawerFeedbackTone;
    text: string;
  } | null;
  saving: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onMethodChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function TranslationRequestDrawer({
  open,
  methodValue,
  contentValue,
  targetLanguageValue,
  priorityValue,
  noteValue,
  methodOptions,
  contentOptions,
  targetLanguageOptions,
  priorityOptions,
  methodError,
  contentError,
  targetLanguageError,
  priorityError,
  noteError,
  feedback,
  saving,
  canSubmit,
  submitLabel,
  onMethodChange,
  onContentChange,
  onTargetLanguageChange,
  onPriorityChange,
  onNoteChange,
  onClose,
  onSubmit
}: TranslationRequestDrawerProps) {
  return (
    <SideDrawer
      open={open}
      title="Request Translation"
      description="Choose the content, target language, and urgency so the team can track this work in one place."
      onClose={onClose}
      footerActions={
        <div className="translation-request-drawer__footer">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={saving} disabled={!canSubmit}>
            {submitLabel}
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

        <div className="translation-request-drawer__field">
          <Select
            id="translation-request-method"
            label="Translation Method"
            value={methodValue}
            options={methodOptions}
            placeholder="Choose how this translation should be handled"
            emptyMessage="No translation methods are configured yet."
            hint="Send Internal Request routes the work to the team. Translate With Integration queues it for automated processing."
            disabled={methodOptions.length === 0}
            onChange={onMethodChange}
          />
          {methodError ? (
            <p className="translation-request-drawer__field-error">{methodError}</p>
          ) : null}
        </div>

        <div className="translation-request-drawer__field">
          <Select
            id="translation-request-content"
            label="Select Content"
            value={contentValue}
            options={contentOptions}
            placeholder="Choose the content item"
            emptyMessage="No content items are available yet."
            hint="Only active content items appear here."
            disabled={contentOptions.length === 0}
            onChange={onContentChange}
          />
          {contentError ? (
            <p className="translation-request-drawer__field-error">{contentError}</p>
          ) : null}
        </div>

        <div className="translation-request-drawer__field">
          <Select
            id="translation-request-language"
            label="Target Language"
            value={targetLanguageValue}
            options={targetLanguageOptions}
            placeholder="Choose the target language"
            emptyMessage="No translation languages are configured yet."
            hint="This list is managed from Settings so admins can update it without code changes."
            disabled={targetLanguageOptions.length === 0}
            onChange={onTargetLanguageChange}
          />
          {targetLanguageError ? (
            <p className="translation-request-drawer__field-error">{targetLanguageError}</p>
          ) : null}
        </div>

        <div className="translation-request-drawer__field">
          <Select
            id="translation-request-priority"
            label="Priority"
            value={priorityValue}
            options={priorityOptions}
            placeholder="Choose the request priority"
            emptyMessage="No translation priorities are configured yet."
            hint="Priority options are also managed from Settings."
            disabled={priorityOptions.length === 0}
            onChange={onPriorityChange}
          />
          {priorityError ? (
            <p className="translation-request-drawer__field-error">{priorityError}</p>
          ) : null}
        </div>

        <div className="translation-request-drawer__field">
          <Textarea
            id="translation-request-note"
            label="Notes"
            rows={5}
            value={noteValue}
            hint="Add any context that would help the translation team understand tone, usage, or timing."
            {...(noteError ? { error: noteError } : {})}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </div>
      </div>
    </SideDrawer>
  );
}
