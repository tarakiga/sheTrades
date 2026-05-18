"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  ConfirmationModal,
  IconActionButton,
  SideDrawer
} from "../../../components/ui";

function PreviewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M2 10C3.8 6.8 6.6 5.2 10 5.2C13.4 5.2 16.2 6.8 18 10C16.2 13.2 13.4 14.8 10 14.8C6.6 14.8 3.8 13.2 2 10Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M4.2 13.8L13.8 4.2L15.8 6.2L6.2 15.8L3.5 16.5L4.2 13.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.8 6.2L13.8 8.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M4.5 6H15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7.5 6V4.6C7.5 4.27 7.77 4 8.1 4H11.9C12.23 4 12.5 4.27 12.5 4.6V6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M6.2 6L6.8 14.4C6.84 14.97 7.31 15.4 7.88 15.4H12.12C12.69 15.4 13.16 14.97 13.2 14.4L13.8 6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function OverlayPreviewDemo() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="preview-card-content">
      <div className="preview-row">
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
          Open Drawer Preview
        </Button>
        <Button variant="danger" onClick={() => setModalOpen(true)}>
          Open Confirmation Preview
        </Button>
        <Badge variant="info">Interactive Demo</Badge>
      </div>
      <p className="admin-inline-note">
        Review the overlay states here before they are used in the settings workflow.
      </p>
      <div className="config-table__action-rail">
        <IconActionButton icon={<PreviewIcon />} label="Preview" />
        <IconActionButton icon={<EditIcon />} label="Edit" tone="primary" />
        <IconActionButton icon={<TrashIcon />} label="Move To Trash" tone="danger" />
      </div>

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Preview Item Details"
        description="Read-only drawer for inspecting item details before editing or removing."
        footerActions={
          <div className="config-preview__actions">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setDrawerOpen(false);
              }}
            >
              Edit
            </Button>
          </div>
        }
      >
        <div className="config-preview">
          <div className="config-preview__grid">
            <div>
              <p className="config-preview__label">Item Name</p>
              <p className="config-preview__value">content.welcome.message</p>
            </div>
            <div>
              <p className="config-preview__label">Status</p>
              <p className="config-preview__value">Live</p>
            </div>
            <div>
              <p className="config-preview__label">Draft Version</p>
              <p className="config-preview__value">v4</p>
            </div>
            <div>
              <p className="config-preview__label">Live Version</p>
              <p className="config-preview__value">v3</p>
            </div>
          </div>
          <div>
            <p className="config-preview__label">Payload Preview</p>
            <pre className="config-preview__code">
              {JSON.stringify(
                {
                  en: "Welcome to SheTrades",
                  pcm: "Welcome to SheTrades",
                  ig: "Welcome to SheTrades"
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </SideDrawer>

      <ConfirmationModal
        open={modalOpen}
        title="Move Item To Trash?"
        description="This will remove the item from active use. You can restore it later."
        confirmLabel="Move To Trash"
        tone="danger"
        loading={confirming}
        confirmHint="History stays available, so nothing is lost permanently."
        onCancel={() => {
          if (!confirming) setModalOpen(false);
        }}
        onConfirm={() => {
          setConfirming(true);
          window.setTimeout(() => {
            setConfirming(false);
            setModalOpen(false);
          }, 700);
        }}
      />
    </div>
  );
}
