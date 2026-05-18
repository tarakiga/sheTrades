import type { ReactNode } from "react";

export type AdminReviewTableShellProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AdminReviewTableShell({
  title,
  description,
  actions,
  children,
  className
}: AdminReviewTableShellProps) {
  return (
    <section className={["admin-review-table-shell", className ?? ""].filter(Boolean).join(" ")}>
      <div className="admin-review-table-shell__header">
        <div>
          <h3 className="admin-review-table-shell__title">{title}</h3>
          <p className="admin-review-table-shell__description">{description}</p>
        </div>
        {actions ? <div className="admin-review-table-shell__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
