"use client";

import { Card, EmptyState, Table } from "../ui";
import type { HelpRequestRow } from "../../lib/admin/contracts";

/**
 * "Users requesting help" — learners who tapped the help option during a lesson
 * check-in.
 *
 * Distinct from "At-Risk Learners", which is *inferred* from low completion.
 * This is an explicit request the learner made, so it belongs at the top of the
 * operator's attention rather than buried in the /users directory.
 */
export type HelpRequestsPanelProps = {
  requests: HelpRequestRow[];
  /** Shown while the first fetch is in flight, so an empty list is not mistaken for "none". */
  loading?: boolean;
};

function formatWhen(flaggedAt: string | null): string {
  if (!flaggedAt) return "—";
  const parsed = new Date(flaggedAt);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function HelpRequestsPanel({ requests, loading = false }: HelpRequestsPanelProps) {
  const rows = requests.map((row) => ({
    learner: row.name?.trim() || "(name not captured)",
    // The phone number is what makes an unnamed request actionable — it is how
    // the team reaches the learner back on WhatsApp.
    phone: row.phone,
    context: row.latestNote?.trim() || "Asked for help in a lesson",
    when: formatWhen(row.flaggedAt)
  }));

  return (
    <Card
      title="Users requesting help"
      description="Learners who tapped the help option during a lesson check-in. Newest first."
    >
      {rows.length > 0 ? (
        <Table
          wrapperClassName="admin-review-table-wrap admin-review-table-wrap--compact"
          tableClassName="admin-review-table admin-review-table--compact"
          columns={[
            {
              key: "learner",
              header: "Learner",
              render: (value, row) => (
                <div className="users-directory__identity">
                  <span className="users-directory__name">{String(value)}</span>
                  <span className="users-directory__meta">{String(row.phone)}</span>
                </div>
              )
            },
            { key: "context", header: "Context" },
            { key: "when", header: "Requested" }
          ]}
          rows={rows}
        />
      ) : (
        <EmptyState
          title={loading ? "Loading help requests…" : "No open help requests"}
          description={
            loading
              ? "Checking for learners who asked for help."
              : "When a learner taps the help option in a lesson check-in, they appear here."
          }
        />
      )}
    </Card>
  );
}
