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
 *
 * Laid out as two columns, not three. This panel sits in a ~385px card in a
 * 3-up grid; a Learner / Context / Requested split left every column too narrow
 * to read, so the timestamp is stacked under the lesson as secondary meta.
 */
export type HelpRequestsPanelProps = {
  requests: HelpRequestRow[];
  /** Shown while the first fetch is in flight, so an empty list is not mistaken for "none". */
  loading?: boolean;
};

/**
 * Relative time ("12 min ago") rather than an absolute stamp: it is far shorter,
 * and for a triage list the useful question is "how long have they been
 * waiting?", not the exact clock time.
 */
export function formatRelativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";

  const minutes = Math.round((now - parsed.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Strip the stored note down to what the lesson actually was.
 *
 * Notes are written as `[2026-07-21] Asked for help: <lesson> (<module>, Q1)`.
 * The date is already conveyed by the relative timestamp and the "asked for
 * help" prefix is implied by the panel title, so both are noise in a narrow
 * column — only the lesson and module carry information here.
 */
export function summariseHelpNote(note: string): string {
  const trimmed = (note ?? "").trim();
  if (!trimmed) return "Asked for help in a lesson";
  const afterPrefix = trimmed.replace(/^\[[^\]]*\]\s*/, "").replace(/^Asked for help:\s*/i, "");
  return afterPrefix || "Asked for help in a lesson";
}

export function HelpRequestsPanel({ requests, loading = false }: HelpRequestsPanelProps) {
  const rows = requests.map((row) => ({
    learner: row.name?.trim() || "(name not captured)",
    // The phone number is what makes an unnamed request actionable — it is how
    // the team reaches the learner back on WhatsApp.
    phone: row.phone,
    context: summariseHelpNote(row.latestNote),
    when: formatRelativeTime(row.flaggedAt)
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
                  <span className="users-directory__name" title={String(value)}>
                    {String(value)}
                  </span>
                  <span className="users-directory__meta">{String(row.phone)}</span>
                </div>
              )
            },
            {
              key: "context",
              header: "Asked about",
              render: (value, row) => (
                <div className="users-directory__identity">
                  {/* title carries the full text, since the cell truncates. */}
                  <span className="users-directory__name" title={String(value)}>
                    {String(value)}
                  </span>
                  {row.when ? (
                    <span className="users-directory__meta">{String(row.when)}</span>
                  ) : null}
                </div>
              )
            }
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
