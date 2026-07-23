"use client";

import { FunnelBars } from "../../../components/ui";

/**
 * The analytics funnel visual with the staging numbers that motivated it.
 * Note the deliberately non-monotonic stages (quiz attempts > completed):
 * shares are relative to the FIRST stage, not the previous one.
 */
export function FunnelBarsPreview() {
  return (
    <div className="preview-card-content">
      <FunnelBars
        ariaLabel="Example learner funnel"
        stages={[
          { label: "Registered", count: 43 },
          { label: "Started", count: 15 },
          { label: "Completed", count: 2 },
          { label: "Quiz Attempt", count: 20 },
          { label: "Passed", count: 15 }
        ]}
      />
    </div>
  );
}
