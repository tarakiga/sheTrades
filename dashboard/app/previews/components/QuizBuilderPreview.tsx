"use client";

import { useState } from "react";
import { Button } from "../../../components/ui";
import { ConfigEditorDrawer } from "../../../components/config/ConfigEditorDrawer";

/**
 * Preview for the lesson quiz builder inside ConfigEditorDrawer.
 *
 * The drawer only renders its step wizard (and therefore the quiz builder) when
 * the payload looks like lesson content - it keys off `languages` / `quiz` /
 * `module`. The existing GuidedSettingsWorkspacePreview passes a plain
 * `{"en":"..."}` payload, so the quiz builder never appeared anywhere in the
 * preview environment. Per the component-preview rules, it needs its own entry.
 *
 * The fixture deliberately contains BOTH question types so the difference is
 * visible side by side:
 *  - Q1 is a knowledge question - has a correct answer, wrong answers retry.
 *  - Q2 is a check-in - no right answer, every option advances, and option 2 is
 *    marked as the help request (which flags the learner for follow-up).
 *
 * Q2 is the real Module 2 Lesson 6 question a tester reported: "I need help
 * migrating" was being scored as a wrong answer and looping the learner.
 */
const LESSON_FIXTURE = {
  title: { en: "My WhatsApp Business Shop" },
  module: "Module 2: Selling Online",
  languages: {
    en: "Using standard WhatsApp to run a busy shop is like carrying a full market load in a small handbag. WhatsApp Business is a separate, free app built for traders."
  },
  audioUrls: {},
  quiz: [
    {
      question: { en: "Which WhatsApp Business tool shows your products with pictures and prices?" },
      options: [{ en: "Catalog" }, { en: "Status only" }, { en: "Profile photo" }],
      answerIndex: 0
    },
    {
      question: {
        en: "Did you run a chat backup or set up a WhatsApp Business tool today?"
      },
      options: [{ en: "Yes, system is set" }, { en: "I need help migrating" }, { en: "Not yet" }],
      answerIndex: 0,
      kind: "reflection",
      helpOptionIndex: 1
    }
  ]
};

export function QuizBuilderPreview() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(JSON.stringify(LESSON_FIXTURE, null, 2));

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open lesson quiz builder
      </Button>

      <ConfigEditorDrawer
        open={open}
        mode="edit"
        namespace="content"
        namespaceLabel="Content Workspace"
        title="Edit Lesson"
        description="Step through lesson metadata, body copy, and the quiz builder."
        keyLabel="Internal Name"
        keyValue="content.lesson.m2_l6_m"
        keyPlaceholder="content.lesson.onboarding"
        onKeyChange={() => undefined}
        titleLabel="Display Title"
        titleValue="My WhatsApp Business Shop"
        titlePlaceholder="Title people will recognize"
        onTitleChange={() => undefined}
        payloadLabel="Content Details (JSON)"
        payloadValue={payload}
        payloadPlaceholder="{}"
        payloadHint="Switch to Raw JSON to confirm what the quiz builder serializes."
        onPayloadChange={setPayload}
        saving={false}
        primaryActionLabel="Save Draft"
        primaryActionDisabled={false}
        onPrimaryAction={() => setOpen(false)}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
