"use client";

import { useState } from "react";
import { Button, Card, GuidedTour, type TourStep } from "../../../components/ui";

const STEPS: TourStep[] = [
  {
    title: "Welcome aboard",
    body: "A guided spotlight tour dims the page and highlights one element at a time with a plain-language explanation. Great for onboarding non-technical users."
  },
  {
    target: "#guided-tour-preview-a",
    title: "This is the first stop",
    body: "The spotlight animates between targets. The card flips above/below the target depending on available space."
  },
  {
    target: "#guided-tour-preview-b",
    title: "And the second",
    body: "Use Back / Next / Skip, the arrow keys, or Esc. Progress dots show where you are."
  },
  {
    title: "That's the pattern",
    body: "Steps without a target render centered (intro / outro)."
  }
];

export function GuidedTourPreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="preview-card-content">
      <Button onClick={() => setOpen(true)}>Launch guided tour</Button>
      <div className="preview-row" style={{ marginTop: "1rem" }}>
        <div id="guided-tour-preview-a">
          <Card title="Target A" description="First spotlight target.">
            <p className="admin-review-support-note">Some content to highlight.</p>
          </Card>
        </div>
        <div id="guided-tour-preview-b">
          <Card title="Target B" description="Second spotlight target.">
            <p className="admin-review-support-note">More content to highlight.</p>
          </Card>
        </div>
      </div>
      <GuidedTour open={open} steps={STEPS} onClose={() => setOpen(false)} />
    </div>
  );
}
