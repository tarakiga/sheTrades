"use client";

import { useEffect, useState } from "react";
import { Button, GuidedTour, type TourStep } from "../ui";

const STORAGE_KEY = "shetrades.content.form.tour.v1";

const STEPS: TourStep[] = [
  {
    title: "Create content, step by step",
    body: "This form builds a lesson or message piece by piece — no code needed. Here's a quick look at how it works."
  },
  {
    target: ".wizard-mode-toggle",
    title: "Pick your editor",
    body: "Stay on the Visual Wizard (recommended) for a friendly, guided experience. Power users can switch to the Raw JSON editor if they prefer."
  },
  {
    target: ".wizard-progress",
    title: "Work through the steps",
    body: "Move through each step in order: lesson details, the content in every language, the quiz, and a live WhatsApp preview. The bar shows your progress."
  },
  {
    target: ".wizard-panel",
    title: "Fill in this step",
    body: "Complete the fields for the current step here. The form keeps everything organized and validates as you go, so you can't miss a required field."
  },
  {
    target: ".config-drawer__footer",
    title: "Save, then publish",
    body: "Save your work as a draft at any time. When it's ready, press Publish to make it live for learners — nothing reaches them until you publish."
  },
  {
    title: "That's the whole form",
    body: "You can replay this anytime with “Tour this form”. Go ahead and create your content!"
  }
];

export type ContentFormWalkthroughProps = {
  label?: string;
};

export function ContentFormWalkthrough({ label = "Tour this form" }: ContentFormWalkthroughProps) {
  const [open, setOpen] = useState(false);

  // Auto-show once per browser the first time the create/edit form opens.
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      seen = true;
    }
    if (seen) return;
    const timer = window.setTimeout(() => setOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  function handleClose() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <Button variant="secondary" className="content-tour-cta" onClick={() => setOpen(true)}>
        <svg
          className="content-tour-cta__icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3Z" />
          <path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
        </svg>
        {label}
      </Button>
      <GuidedTour open={open} steps={STEPS} onClose={handleClose} />
    </>
  );
}
