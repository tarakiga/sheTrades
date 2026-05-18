"use client";

import { IconActionButton } from "./IconActionButton";

type AdminActionIcon = "preview" | "message" | "flag" | "history";
type AdminActionTone = "neutral" | "primary" | "danger" | "success";

export type AdminActionRailItem = {
  id: string;
  label: string;
  icon: AdminActionIcon;
  tone?: AdminActionTone;
  disabled?: boolean;
};

export type AdminActionRailProps = {
  actions: Array<AdminActionRailItem>;
  className?: string;
};

function ActionIcon({ icon }: { icon: AdminActionIcon }) {
  if (icon === "message") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d="M3 5.75a2.75 2.75 0 0 1 2.75-2.75h8.5A2.75 2.75 0 0 1 17 5.75v5.5A2.75 2.75 0 0 1 14.25 14H8.4L5 16.8V14H5.75A2.75 2.75 0 0 1 3 11.25z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (icon === "flag") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d="M5 3v14M5 4.25h7.2l-1.25 2.5 1.25 2.5H5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (icon === "history") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d="M4 10a6 6 0 1 0 2-4.47M4 4.5v3.25h3.25M10 6.75V10l2.5 1.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d="M2.75 10s2.75-5 7.25-5 7.25 5 7.25 5-2.75 5-7.25 5-7.25-5-7.25-5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function AdminActionRail({ actions, className }: AdminActionRailProps) {
  return (
    <div className={["admin-action-rail", className ?? ""].filter(Boolean).join(" ")}>
      {actions.map((action) => (
        <IconActionButton
          key={action.id}
          icon={<ActionIcon icon={action.icon} />}
          label={action.label}
          tone={action.tone ?? "neutral"}
          disabled={action.disabled}
        />
      ))}
    </div>
  );
}
