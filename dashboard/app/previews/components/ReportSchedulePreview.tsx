"use client";

import { useState } from "react";
import { Button } from "../../../components/ui";
import { ReportScheduleDrawer } from "../../../components/reports/ReportScheduleDrawer";

const FIXTURE_PRESETS = [
  {
    id: "donor",
    label: "Partner",
    content: "Impact metrics, completion funnel, reward totals.",
    reportType: "donor_summary"
  },
  {
    id: "ops",
    label: "Ops",
    content: "Daily completion deltas, drop-off list, exceptions.",
    reportType: "module_completion_detail"
  },
  {
    id: "finance",
    label: "Finance",
    content: "Reward issuance ledger and reconciliations.",
    reportType: "rewards_issuance_log"
  }
];

/**
 * Opens the real Report Schedule drawer with fixture presets. In the gallery
 * (no admin token / backend) the recipient pickers fall back to their empty
 * states and the one-off email flow stays fully interactive; pressing Create
 * surfaces the error state, which is itself worth reviewing.
 */
export function ReportSchedulePreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="preview-card-content">
      <div className="preview-row">
        <Button onClick={() => setOpen(true)}>Open Report Schedule Drawer</Button>
      </div>
      <ReportScheduleDrawer
        open={open}
        onClose={() => setOpen(false)}
        presets={FIXTURE_PRESETS}
        onCreated={() => undefined}
      />
    </div>
  );
}
