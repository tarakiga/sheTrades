"use client";

import { useEffect, useState } from "react";
import { Button, GuidedTour, type TourStep } from "../ui";

const STORAGE_KEY = "shetrades.content.tour.v1";

const STEPS: TourStep[] = [
  {
    title: "Welcome to your Content workspace",
    body: "This is where you manage every lesson and message learners receive on WhatsApp — all without writing any code. Let's take a quick 60-second tour."
  },
  {
    target: '[data-tour="content-toolbar"]',
    title: "Add and find content",
    body: "Click “Create Content” to add a new lesson or message. A step-by-step wizard guides you: choose a module, write the text in each language, and build the quiz. Use Search and the All / Draft / Live / Trash filters to find anything quickly."
  },
  {
    target: '[data-tour="content-table"]',
    title: "Your content library",
    body: "Every item lives here. Click any row to preview it on a phone mock-up, edit the draft, publish changes, or move it to trash."
  },
  {
    target: '[data-tour="content-table"]',
    title: "Edit safely — draft, then publish",
    body: "Your edits are saved as a DRAFT first. Nothing reaches learners until you press Publish, so you can revise with confidence. Every version is kept, and you can roll back to a previous one anytime."
  },
  {
    target: '[data-tour="content-translations"]',
    title: "Manage translations",
    body: "Need content in another language? Track and action translation requests from this panel so every learner gets content they understand."
  },
  {
    title: "You're all set",
    body: "That's the workspace! You can replay this tour anytime with the “Take a tour” button at the top. Happy publishing."
  }
];

export type ContentWalkthroughProps = {
  label?: string;
};

export function ContentWalkthrough({ label = "Take a tour" }: ContentWalkthroughProps) {
  const [open, setOpen] = useState(false);

  // Auto-show once per browser (first visit), after the page settles.
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      seen = true;
    }
    if (seen) return;
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  function handleClose() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore storage errors (private mode, etc.) */
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
