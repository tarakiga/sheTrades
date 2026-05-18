import type { ReactNode } from "react";

export type AdminInsightPanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AdminInsightPanel({
  title,
  description,
  children,
  className
}: AdminInsightPanelProps) {
  return (
    <section className={["admin-insight-panel", className ?? ""].filter(Boolean).join(" ")}>
      <div className="admin-insight-panel__header">
        <h4 className="admin-insight-panel__title">{title}</h4>
        {description ? <p className="admin-insight-panel__description">{description}</p> : null}
      </div>
      <div className="admin-insight-panel__content">{children}</div>
    </section>
  );
}
