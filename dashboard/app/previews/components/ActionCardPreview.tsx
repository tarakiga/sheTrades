"use client";

import { useState } from "react";
import { ActionCard, Button } from "../../../components/ui";

/**
 * The action card in a wrapping grid, as the Reports page uses it: one
 * choice per card, each with its own action. The first card is live so the
 * loading state can be seen.
 */
export function ActionCardPreview() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="report-preset-grid">
      <ActionCard
        title="Donor"
        description="Monthly disbursements, enrolments, completions, median days to complete."
        badge={{ label: "For donors", variant: "teal" }}
        action={
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => setBusy(false), 1200);
            }}
          >
            Generate
          </Button>
        }
      />
      <ActionCard
        title="M&E participant report"
        description="Name and phone, a status per module, course status, WAT timestamps."
        badge={{ label: "Internal", variant: "warning" }}
        note="Contains personal data. For the team only."
        action={<Button variant="secondary">Generate</Button>}
      />
      <ActionCard
        title="Finance"
        description="Reward issuance ledger and reconciliations."
        badge={{ label: "Internal", variant: "warning" }}
        action={<Button variant="secondary">Generate</Button>}
      />
    </div>
  );
}
