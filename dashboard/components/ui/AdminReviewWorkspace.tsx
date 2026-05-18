import type { ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";
import {
  AdminWorkspaceMetricStrip,
  type AdminWorkspaceMetric
} from "./AdminWorkspaceMetricStrip";

export type AdminReviewWorkspaceProps = {
  as?: "main" | "div";
  title: string;
  description: string;
  actions?: ReactNode;
  feedback?: ReactNode;
  metrics: Array<AdminWorkspaceMetric>;
  metricsAriaLabel: string;
  primary: ReactNode;
  secondary?: ReactNode;
};

export function AdminReviewWorkspace({
  as = "main",
  title,
  description,
  actions,
  feedback,
  metrics,
  metricsAriaLabel,
  primary,
  secondary
}: AdminReviewWorkspaceProps) {
  const Component = as;

  return (
    <Component className="admin-dashboard-page admin-review-workspace">
      <SectionHeader title={title} description={description} actions={actions} />
      {feedback ? <div className="admin-review-workspace__feedback">{feedback}</div> : null}
      <AdminWorkspaceMetricStrip metrics={metrics} ariaLabel={metricsAriaLabel} />
      <div className="admin-review-workspace__primary">{primary}</div>
      {secondary ? <div className="admin-review-workspace__secondary">{secondary}</div> : null}
    </Component>
  );
}
