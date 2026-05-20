import type { ReactNode } from "react";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "purple" | "teal";

export type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
};

const badgeVariantClassName: Record<BadgeVariant, string> = {
  neutral: "ui-badge--neutral",
  info: "ui-badge--info",
  success: "ui-badge--success",
  warning: "ui-badge--warning",
  danger: "ui-badge--danger",
  purple: "ui-badge--purple",
  teal: "ui-badge--teal"
};

export function Badge({ children, variant = "neutral" }: BadgeProps) {
  return <span className={`ui-badge ${badgeVariantClassName[variant]}`}>{children}</span>;
}
