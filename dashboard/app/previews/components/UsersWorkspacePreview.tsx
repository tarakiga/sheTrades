"use client";

import { useState } from "react";
import { Card, SectionHeader, Button } from "../../../components/ui";
import { LearnerDetailDrawer } from "../../../components/users/LearnerDetailDrawer";

const MOCK_PHONE = "+2348031234567";

function noop(): void {
  /* preview only */
}

async function noopAsync(): Promise<void> {
  /* preview only */
}

function DrawerOpenVariant() {
  const [open, setOpen] = useState(false);
  return (
    <div className="preview-card-content">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open Learner Drawer
      </Button>
      <LearnerDetailDrawer
        phone={MOCK_PHONE}
        open={open}
        onClose={() => setOpen(false)}
        onFlagChange={noopAsync}
      />
    </div>
  );
}

function DrawerInFrameVariant() {
  return (
    <div className="preview-drawer-frame">
      <LearnerDetailDrawer
        phone={MOCK_PHONE}
        open
        onClose={noop}
        onFlagChange={noopAsync}
      />
    </div>
  );
}

function DrawerClosedVariant() {
  return (
    <div className="preview-card-content">
      <p className="preview-card-content__caption">
        (Nothing renders below — closed drawer is a no-op.)
      </p>
      <LearnerDetailDrawer
        phone={null}
        open={false}
        onClose={noop}
        onFlagChange={noopAsync}
      />
    </div>
  );
}

export function UsersWorkspacePreview() {
  return (
    <div className="preview-card-content">
      <SectionHeader
        title="Users Workspace"
        description="Learner detail drawer in all states: closed, in-frame loading, and toggle-open for full overlay."
      />

      <Card
        title="Learner Detail Drawer — closed"
        description="When phone is null and open is false, the drawer renders nothing."
      >
        <DrawerClosedVariant />
      </Card>

      <Card
        title="Learner Detail Drawer — loading (in-frame)"
        description="Renders the drawer inside a fixed-height preview frame, immediately in loading state while it fetches live data for the mock phone."
      >
        <DrawerInFrameVariant />
      </Card>

      <Card
        title="Learner Detail Drawer — toggle open (overlay)"
        description="Click the button to open the drawer as a true full-page overlay. ESC or the Close button dismisses it."
      >
        <DrawerOpenVariant />
      </Card>
    </div>
  );
}
