"use client";

import { useState } from "react";
import { TranslationCompletionDrawer } from "../../../components/content/TranslationCompletionDrawer";
import { TranslationRequestDrawer } from "../../../components/content/TranslationRequestDrawer";
import { TranslationRequestQueuePanel } from "../../../components/content/TranslationRequestQueuePanel";

export function TranslationRequestWorkflowPreview() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [completionDrawerOpen, setCompletionDrawerOpen] = useState(true);
  const [methodValue, setMethodValue] = useState("internal_request");
  const [contentValue, setContentValue] = useState("content-1");
  const [targetLanguageValue, setTargetLanguageValue] = useState("pcm");
  const [priorityValue, setPriorityValue] = useState("normal");
  const [noteValue, setNoteValue] = useState("Use a warm and instructional tone for new learners.");
  const [translatedContentValue, setTranslatedContentValue] = useState(
    "Welcome to SheTrades. We are glad to have you here."
  );
  const [completionNoteValue, setCompletionNoteValue] = useState(
    "Saved from the integration output and ready for editorial review."
  );

  return (
    <div className="preview-card-content">
      <TranslationRequestQueuePanel
        loading={false}
        canRequest
        feedback={{
          tone: "success",
          text: "Translation request saved and added to the queue."
        }}
        onRequestTranslation={() => setDrawerOpen(true)}
        onCompleteRequest={() => setCompletionDrawerOpen(true)}
        onOpenDraft={() => undefined}
        requests={[
          {
            id: "request-1",
            contentTitle: "Welcome Message",
            contentKey: "content.message.welcome",
            methodLabel: "Send Internal Request",
            methodVariant: "neutral",
            targetLanguageLabel: "Pidgin",
            priorityLabel: "Normal",
            statusLabel: "Pending",
            statusVariant: "warning",
            requestedAtLabel: "May 17, 10:15 AM",
            canComplete: true,
            canOpenDraft: false
          },
          {
            id: "request-2",
            contentTitle: "Onboarding Lesson",
            contentKey: "content.lesson.onboarding",
            methodLabel: "Translate With Integration",
            methodVariant: "info",
            targetLanguageLabel: "Igbo",
            priorityLabel: "High",
            statusLabel: "Queued for Integration",
            statusVariant: "info",
            requestedAtLabel: "May 16, 3:20 PM",
            canComplete: true,
            canOpenDraft: false
          },
          {
            id: "request-3",
            contentTitle: "Consent Notice",
            contentKey: "content.message.consent_notice",
            methodLabel: "Translate With Integration",
            methodVariant: "info",
            targetLanguageLabel: "Pidgin",
            priorityLabel: "Normal",
            statusLabel: "Ready for Review",
            statusVariant: "success",
            requestedAtLabel: "May 17, 12:05 PM",
            completedAtLabel: "May 17, 12:24 PM",
            completionNote: "Draft created for review before publishing.",
            canComplete: false,
            canOpenDraft: true
          }
        ]}
      />

      <TranslationRequestDrawer
        open={drawerOpen}
        methodValue={methodValue}
        contentValue={contentValue}
        targetLanguageValue={targetLanguageValue}
        priorityValue={priorityValue}
        noteValue={noteValue}
        methodOptions={[
          { value: "internal_request", label: "Send Internal Request" },
          { value: "integration_job", label: "Translate With Integration" }
        ]}
        contentOptions={[
          { value: "content-1", label: "Welcome Message - content.message.welcome" },
          { value: "content-2", label: "Onboarding Lesson - content.lesson.onboarding" }
        ]}
        targetLanguageOptions={[
          { value: "en", label: "English" },
          { value: "pcm", label: "Pidgin" },
          { value: "ig", label: "Igbo" }
        ]}
        priorityOptions={[
          { value: "low", label: "Low" },
          { value: "normal", label: "Normal" },
          { value: "high", label: "High" }
        ]}
        saving={false}
        canSubmit
        submitLabel={methodValue === "integration_job" ? "Queue Integration" : "Send Request"}
        onMethodChange={setMethodValue}
        onContentChange={setContentValue}
        onTargetLanguageChange={setTargetLanguageValue}
        onPriorityChange={setPriorityValue}
        onNoteChange={setNoteValue}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => setDrawerOpen(false)}
      />

      <TranslationCompletionDrawer
        open={completionDrawerOpen}
        contentTitle="Welcome Message"
        contentKey="content.message.welcome"
        methodLabel="Translate With Integration"
        targetLanguageLabel="Pidgin"
        translatedContentValue={translatedContentValue}
        completionNoteValue={completionNoteValue}
        saving={false}
        canSubmit
        onTranslatedContentChange={setTranslatedContentValue}
        onCompletionNoteChange={setCompletionNoteValue}
        onClose={() => setCompletionDrawerOpen(false)}
        onSubmit={() => setCompletionDrawerOpen(false)}
      />
    </div>
  );
}
