"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconActionTone = "neutral" | "primary" | "danger" | "success";

export type IconActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  tone?: IconActionTone;
  loading?: boolean;
};

const toneClassName: Record<IconActionTone, string> = {
  neutral: "ui-icon-action__button--neutral",
  primary: "ui-icon-action__button--primary",
  danger: "ui-icon-action__button--danger",
  success: "ui-icon-action__button--success"
};

export function IconActionButton({
  icon,
  label,
  tone = "neutral",
  loading = false,
  className,
  disabled,
  ...props
}: IconActionButtonProps) {
  const computedClassName = ["ui-icon-action__button", toneClassName[tone], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className="ui-icon-action" data-tooltip={label}>
      <button
        type="button"
        className={computedClassName}
        aria-label={label}
        title={label}
        disabled={disabled || loading}
        suppressHydrationWarning
        {...props}
      >
        {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : icon}
      </button>
    </span>
  );
}
