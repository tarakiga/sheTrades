"use client";

import { useState } from "react";
import { Button } from "../../../components/ui";
import { ContactLearnerDrawer } from "../../../components/users/ContactLearnerDrawer";

/**
 * Opens the real Contact Learner drawer against a fixture learner. In the
 * gallery (no admin token / backend) the template and history fetches degrade
 * to their empty states, which is itself one of the states worth reviewing;
 * the mode toggle, free-text counter, and send gating are fully interactive.
 */
export function ContactLearnerPreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="preview-card-content">
      <div className="preview-row">
        <Button onClick={() => setOpen(true)}>Open Contact Learner Drawer</Button>
      </div>
      <ContactLearnerDrawer
        phone="+2348000111444"
        name="Amaka Obi"
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
