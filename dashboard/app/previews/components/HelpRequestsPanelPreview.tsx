"use client";

import { HelpRequestsPanel } from "../../../components/users/HelpRequestsPanel";

/**
 * Preview for the Overview "Users requesting help" panel. The real page is
 * behind admin auth, so this is the only place the panel can be inspected
 * without credentials — and the only place its empty and loading states are
 * reachable at all.
 */
export function HelpRequestsPanelPreview() {
  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <HelpRequestsPanel
        requests={[
          {
            phone: "+2348012345678",
            name: "Jonas Emelda",
            language: "pcm",
            location: "Anambra",
            latestNote: "[2026-07-21] Asked for help: m2_l6_m (Module 2, Q1)",
            flaggedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString()
          },
          {
            phone: "+2348098765432",
            name: null,
            language: "ig",
            location: "Delta",
            latestNote: "[2026-07-21] Asked for help: m3_l7_i (Module 3, Q1)",
            flaggedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
          },
          {
            phone: "+2348055512345",
            name: "Ngozi A.",
            language: "en",
            location: "Abuja",
            latestNote: "",
            flaggedAt: null
          }
        ]}
      />

      <HelpRequestsPanel requests={[]} />
      <HelpRequestsPanel requests={[]} loading />
    </div>
  );
}
