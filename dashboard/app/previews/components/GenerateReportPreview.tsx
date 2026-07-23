"use client";

import { useState } from "react";
import { Button } from "../../../components/ui";
import { GenerateReportDrawer } from "../../../components/reports/GenerateReportDrawer";

const FIXTURE_PRESETS = [
  {
    id: "donor",
    label: "Donor",
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
 * Opens the real Generate Report drawer with fixture presets. In the gallery
 * (no admin token / backend) pressing Generate surfaces the error state, which
 * is itself worth reviewing; preset selection and descriptions are interactive.
 */
export function GenerateReportPreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="preview-card-content">
      <div className="preview-row">
        <Button onClick={() => setOpen(true)}>Open Generate Report Drawer</Button>
      </div>
      <GenerateReportDrawer
        open={open}
        onClose={() => setOpen(false)}
        presets={FIXTURE_PRESETS}
        onGenerated={() => undefined}
      />
    </div>
  );
}
