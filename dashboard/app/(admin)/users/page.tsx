"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadAdminCsv, flagLearner, getUsersPageData, usersExportEndpoint } from "../../../lib/admin/api";
import type { ApiResult, UsersPageData, UserRow } from "../../../lib/admin/contracts";
import {
  AdminActionRail,
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  EmptyState,
  Table
} from "../../../components/ui";
import { LearnerDetailDrawer } from "../../../components/users/LearnerDetailDrawer";

function parsePercent(value: string) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function UsersPage() {
  const [result, setResult] = useState<ApiResult<UsersPageData> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [openPhone, setOpenPhone] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getUsersPageData();
      setResult(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUsersPageData()
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      // GAP-H1: never leave the page without an explanation. The API helper
      // already falls back internally, so this only fires on an unexpected
      // throw - but without it the page would render an empty table silently
      // (and raise an unhandled rejection).
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          data: { users: [] },
          meta: {
            source: "fallback",
            message: `Unable to load learners: ${
              error instanceof Error ? error.message : "unknown error"
            }`
          }
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allUsers = result?.data.users ?? [];
  // Follow-up flags are raised automatically when a learner taps the help
  // option in a lesson check-in. Without a filter the only way to find them is
  // to scroll the whole directory hunting for badges, which does not scale.
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const flaggedCount = useMemo(
    () => allUsers.filter((row) => row.flaggedForFollowUp).length,
    [allUsers]
  );
  const users = useMemo(
    () => (showFlaggedOnly ? allUsers.filter((row) => row.flaggedForFollowUp) : allUsers),
    [allUsers, showFlaggedOnly]
  );
  const meta = result?.meta ?? { source: "fallback" as const };
  const dataMessage = result?.meta.message;

  const activeCount = useMemo(
    () => allUsers.filter((row) => row.status === "Active").length,
    [allUsers]
  );
  const atRiskCount = useMemo(
    () => allUsers.filter((row) => row.status === "At Risk").length,
    [allUsers]
  );
  const uniqueLanguages = useMemo(
    () => new Set(users.map((row) => row.language)).size,
    [users]
  );
  const completionAverage = useMemo(
    () =>
      users.length === 0
        ? "0%"
        : `${(
            users.reduce((total, row) => total + parsePercent(row.completion), 0) / users.length
          ).toFixed(1)}%`,
    [users]
  );
  const topLocations = useMemo(
    () =>
      Array.from(
        users.reduce<Map<string, number>>((accumulator, row) => {
          accumulator.set(row.location, (accumulator.get(row.location) ?? 0) + 1);
          return accumulator;
        }, new Map())
      )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3),
    [users]
  );
  const topLanguages = useMemo(
    () =>
      Array.from(
        users.reduce<Map<string, number>>((accumulator, row) => {
          accumulator.set(row.language, (accumulator.get(row.language) ?? 0) + 1);
          return accumulator;
        }, new Map())
      )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3),
    [users]
  );

  async function handleFlag(phone: string, flagged: boolean) {
    await flagLearner(phone, { flagged });
    await refetch();
  }

  function buildRowActions(row: UserRow) {
    return [
      {
        id: `${row.phone}-preview`,
        label: "Preview learner profile",
        icon: "preview" as const,
        disabled: false,
        onClick: () => setOpenPhone(row.phone)
      },
      {
        id: `${row.phone}-message`,
        label: "Contact learner (coming soon)",
        icon: "message" as const,
        disabled: true
      },
      {
        id: `${row.phone}-flag`,
        label: row.flaggedForFollowUp ? "Remove follow-up flag" : "Flag for follow-up",
        icon: "flag" as const,
        tone: "danger" as const,
        disabled: false,
        onClick: () => void handleFlag(row.phone, !row.flaggedForFollowUp)
      }
    ];
  }

  return (
    <>
      <AdminReviewWorkspace
        title="Users"
        description="Review learner records, spot emerging follow-up needs, and keep the directory ready for action."
        actions={
          <div className="preview-row">
            <Badge variant={meta.source === "live" ? "success" : "warning"}>
              {meta.source === "live" ? "Live Data" : "Fallback Data"}
            </Badge>
            <Button
              variant={showFlaggedOnly ? "primary" : "secondary"}
              aria-pressed={showFlaggedOnly}
              onClick={() => setShowFlaggedOnly((previous) => !previous)}
            >
              {showFlaggedOnly ? `Showing flagged (${flaggedCount})` : `Flagged only (${flaggedCount})`}
            </Button>
            <Button
              onClick={() => {
                void downloadAdminCsv(usersExportEndpoint(), `users-${new Date().toISOString().slice(0, 10)}.csv`);
              }}
            >
              Export Users
            </Button>
          </div>
        }
        {...(dataMessage
          ? { feedback: <p className="admin-inline-note">{dataMessage}</p> }
          : {})}
        metricsAriaLabel="User directory metrics"
        metrics={[
          {
            label: "Total Learners",
            value: String(users.length),
            trend: "Current directory coverage",
            status: (
              <Badge variant={users.length > 0 ? "success" : "warning"}>Coverage</Badge>
            )
          },
          {
            label: "Active Learners",
            value: String(activeCount),
            trend: "Healthy engagement status",
            status: <Badge variant="success">Healthy</Badge>
          },
          {
            label: "At-Risk Learners",
            value: String(atRiskCount),
            trend: "Needs follow-up attention",
            status: (
              <Badge variant={atRiskCount > 0 ? "warning" : "neutral"}>Follow-up</Badge>
            )
          },
          {
            label: "Average Completion",
            value: completionAverage,
            trend: "Across visible learner records",
            status: <Badge variant="info">Dynamic</Badge>
          }
        ]}
        primary={
          <AdminReviewTableShell
            title="Learner Directory"
            description="Scan learner identity, progress, and follow-up state from one calmer review surface."
          >
            <Table
              wrapperClassName="admin-review-table-wrap"
              tableClassName="admin-review-table admin-review-table--users"
              emptyMessage={
                loading
                  ? "Loading learner records…"
                  : showFlaggedOnly
                    ? "No learners are currently flagged for follow-up."
                    : "No learner records are available yet."
              }
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (value, row) => (
                    <div className="users-directory__identity">
                      <span className="users-directory__name">{String(value)}</span>
                      {row.flaggedForFollowUp && (
                        <Badge variant="warning">Flagged</Badge>
                      )}
                      <span className="users-directory__meta">{row.phone}</span>
                    </div>
                  )
                },
                { key: "location", header: "Location" },
                { key: "language", header: "Language" },
                {
                  key: "completion",
                  header: "Completion",
                  render: (value, row) => (
                    <div className="users-directory__progress">
                      <span className="users-directory__progress-value">{String(value)}</span>
                      <span className="users-directory__meta">
                        {row.status === "At Risk" ? "Needs follow-up" : "On track"}
                      </span>
                    </div>
                  )
                },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "Active" ? "success" : "warning"}>
                      {String(value)}
                    </Badge>
                  )
                },
                {
                  key: "phone",
                  header: "",
                  render: (_value, row) => (
                    <AdminActionRail actions={buildRowActions(row)} />
                  )
                }
              ]}
              rows={users}
            />
          </AdminReviewTableShell>
        }
        secondary={
          <div className="admin-review-support-grid">
            <Card
              title="Directory Coverage"
              description="Use this support view to understand where the visible directory is strongest."
            >
              <div className="admin-review-support-stack">
                <div className="admin-review-support-block">
                  <p className="admin-review-support-label">Top locations</p>
                  {topLocations.length > 0 ? (
                    <ul className="admin-review-support-list">
                      {topLocations.map(([location, count]) => (
                        <li key={location}>
                          <span>{location}</span>
                          <strong>{count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-review-support-note">
                      Location coverage will appear once learner records are available.
                    </p>
                  )}
                </div>

                <div className="admin-review-support-block">
                  <p className="admin-review-support-label">Top languages</p>
                  {topLanguages.length > 0 ? (
                    <ul className="admin-review-support-list">
                      {topLanguages.map(([language, count]) => (
                        <li key={language}>
                          <span>{language}</span>
                          <strong>{count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-review-support-note">
                      Language distribution will appear once learner records are available.
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card
              title="User Actions"
              description="Keep import follow-up, moderation, and preview work staged in one secondary zone."
            >
              <EmptyState
                title="No pending user actions"
                description="Bulk import errors, duplicate merges, and live moderation actions will appear here."
                action={
                  <Button variant="secondary" disabled>
                    Create Import Batch (coming soon)
                  </Button>
                }
              />
            </Card>

            <Card
              title="Preview-Ready Action Rail"
              description="The directory already reserves space for profile previews, outreach, and follow-up actions."
            >
              <div className="admin-review-support-stack">
                <p className="admin-review-support-note">
                  Row actions stay compact and icon-first so future side drawers and moderation
                  tools can be added without redesigning the table.
                </p>
                <div className="admin-review-support-badges">
                  <Badge variant="info">Preview Ready</Badge>
                  <Badge variant="neutral">{uniqueLanguages} languages visible</Badge>
                </div>
              </div>
            </Card>
          </div>
        }
      />

      <LearnerDetailDrawer
        phone={openPhone}
        open={openPhone !== null}
        onClose={() => setOpenPhone(null)}
        onFlagChange={async (phone, flagged, note) => {
          await flagLearner(phone, { flagged, ...(note ? { note } : {}) });
          await refetch();
        }}
      />
    </>
  );
}
