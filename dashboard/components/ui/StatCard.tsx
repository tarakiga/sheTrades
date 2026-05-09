import type { ReactNode } from "react";

export type StatCardProps = {
  label: string;
  value: string;
  trend?: string;
  status?: ReactNode;
};

export function StatCard({ label, value, trend, status }: StatCardProps) {
  return (
    <article className="ui-stat-card">
      <p className="ui-stat-card__label">{label}</p>
      <p className="ui-stat-card__value">{value}</p>
      <div className="ui-stat-card__meta">
        {trend ? <span className="ui-stat-card__trend">{trend}</span> : null}
        {status}
      </div>
    </article>
  );
}
