import type { ReactNode } from "react";

export type AdminInsightSurfaceProps = {
  title: string;
  description: string;
  summary?: ReactNode;
  lead: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function AdminInsightSurface({
  title,
  description,
  summary,
  lead,
  aside,
  className
}: AdminInsightSurfaceProps) {
  return (
    <section className={["admin-insight-surface", className ?? ""].filter(Boolean).join(" ")}>
      <div className="admin-insight-surface__header">
        <div>
          <h3 className="admin-insight-surface__title">{title}</h3>
          <p className="admin-insight-surface__description">{description}</p>
        </div>
        {summary ? <div className="admin-insight-surface__summary">{summary}</div> : null}
      </div>
      <div className="admin-insight-surface__body">
        <div className="admin-insight-surface__lead">{lead}</div>
        {aside ? <div className="admin-insight-surface__aside">{aside}</div> : null}
      </div>
    </section>
  );
}
