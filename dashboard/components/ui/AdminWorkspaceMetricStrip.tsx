import type { ReactNode } from "react";
import { StatCard } from "./StatCard";

export type AdminWorkspaceMetric = {
  label: string;
  value: string;
  trend?: string;
  status?: ReactNode;
};

export type AdminWorkspaceMetricStripProps = {
  metrics: Array<AdminWorkspaceMetric>;
  ariaLabel: string;
  className?: string;
};

export function AdminWorkspaceMetricStrip({
  metrics,
  ariaLabel,
  className
}: AdminWorkspaceMetricStripProps) {
  return (
    <section
      className={["admin-workspace-metric-strip", "ui-stat-grid", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
    >
      {metrics.map((metric) => (
        <StatCard
          key={`${metric.label}-${metric.value}`}
          label={metric.label}
          value={metric.value}
          {...(metric.trend ? { trend: metric.trend } : {})}
          {...(metric.status ? { status: metric.status } : {})}
        />
      ))}
    </section>
  );
}
