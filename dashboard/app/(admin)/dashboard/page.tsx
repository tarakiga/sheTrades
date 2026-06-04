"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  EmptyState,
  Table,
  Tabs
} from "../../../components/ui";
import {
  getAnalyticsPageData,
  getRewardsPageData,
  getUsersPageData
} from "../../../lib/admin/api";
import type {
  AnalyticsPageData,
  ApiResult,
  RewardsPageData,
  UsersPageData
} from "../../../lib/admin/contracts";

function toNumber(value: string) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRisk(completionLabel: string): "High" | "Medium" {
  return toNumber(completionLabel) < 25 ? "High" : "Medium";
}

function toStatusVariant(status: "Healthy" | "Watch" | "Needs Setup" | "Idle") {
  switch (status) {
    case "Healthy":
      return "success";
    case "Watch":
      return "warning";
    case "Needs Setup":
      return "danger";
    default:
      return "neutral";
  }
}

export default function AdminDashboardOverviewPage() {
  const [usersResult, setUsersResult] = useState<ApiResult<UsersPageData> | null>(null);
  const [rewardsResult, setRewardsResult] = useState<ApiResult<RewardsPageData> | null>(null);
  const [analyticsResult, setAnalyticsResult] = useState<ApiResult<AnalyticsPageData> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getUsersPageData(), getRewardsPageData(), getAnalyticsPageData()])
      .then(([users, rewards, analytics]) => {
        if (!cancelled) {
          setUsersResult(users);
          setRewardsResult(rewards);
          setAnalyticsResult(analytics);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const usersData = usersResult?.data ?? { users: [] };
  const rewardsData = rewardsResult?.data ?? {
    rewards: [],
    meta: { activeProvider: null, nextCursor: null }
  };
  const analyticsData = analyticsResult?.data ?? {
    registrationRate: "0%",
    completionRate: "0%",
    passRate: "0%",
    funnelOverall: "",
    funnelAnambra: "",
    funnelDelta: ""
  };

  const rewardRows = useMemo(
    () =>
      rewardsData.rewards.slice(0, 5).map((row) => ({
        learner: row.learner,
        module: row.module,
        amount: row.amount,
        status: row.status === "Issued" ? "Issued" : "Pending"
      })),
    [rewardsData.rewards]
  );

  const atRiskRows = useMemo(
    () =>
      usersData.users
        .filter((row) => row.status === "At Risk")
        .slice(0, 5)
        .map((row) => ({
          learner: row.name,
          location: row.location,
          completion: row.completion,
          risk: toRisk(row.completion)
        })),
    [usersData.users]
  );

  const statsSource = useMemo(() => {
    if (!usersResult || !rewardsResult || !analyticsResult) return "fallback";
    return [
      usersResult.meta.source,
      rewardsResult.meta.source,
      analyticsResult.meta.source
    ].every((item) => item === "live")
      ? "live"
      : "fallback";
  }, [usersResult, rewardsResult, analyticsResult]);

  const issuedCount = useMemo(
    () => rewardsData.rewards.filter((row) => row.status === "Issued").length,
    [rewardsData.rewards]
  );

  const totalRewards = useMemo(() => rewardsData.rewards.length, [rewardsData.rewards]);

  const automationRate = useMemo(
    () =>
      totalRewards === 0
        ? "0.0%"
        : `${((issuedCount / totalRewards) * 100).toFixed(1)}%`,
    [issuedCount, totalRewards]
  );

  const funnelReady = useMemo(
    () => !analyticsData.funnelOverall.startsWith("No published"),
    [analyticsData.funnelOverall]
  );

  const operationalRows = useMemo(
    () => [
      {
        area: "Learner Coverage",
        summary:
          usersData.users.length > 0
            ? "Registered learner records are flowing into the directory."
            : "No learner records are available in the current source.",
        signal: `${usersData.users.length} learner records available`,
        status:
          usersData.users.length > 0
            ? ("Healthy" as const)
            : ("Needs Setup" as const),
        source:
          usersResult?.meta.source === "live" ? "Live Data" : "Fallback Data"
      },
      {
        area: "Module Progression",
        summary:
          "Completion and quiz performance remain the clearest learning health signals.",
        signal: `${analyticsData.completionRate} completion / ${analyticsData.passRate} pass rate`,
        status:
          toNumber(analyticsData.completionRate) > 0
            ? ("Healthy" as const)
            : ("Watch" as const),
        source:
          analyticsResult?.meta.source === "live" ? "Live Data" : "Fallback Data"
      },
      {
        area: "Reward Delivery",
        summary:
          "Reward automation shows whether learner completion is flowing through to issuance.",
        signal: `${automationRate} automation across ${totalRewards} reward events`,
        status: totalRewards > 0 ? ("Healthy" as const) : ("Idle" as const),
        source:
          rewardsResult?.meta.source === "live" ? "Live Data" : "Fallback Data"
      },
      {
        area: "Funnel Readiness",
        summary: funnelReady
          ? "The current funnel snapshot is ready to review by cohort and state."
          : "The funnel still needs a published analytics configuration before it becomes useful.",
        signal: funnelReady
          ? "Funnel snapshots are available"
          : "Waiting for published funnel data",
        status: funnelReady ? ("Healthy" as const) : ("Needs Setup" as const),
        source:
          analyticsResult?.meta.source === "live" ? "Live Data" : "Fallback Data"
      }
    ],
    [
      usersData.users,
      usersResult,
      analyticsData.completionRate,
      analyticsData.passRate,
      analyticsResult,
      automationRate,
      totalRewards,
      rewardsResult,
      funnelReady
    ]
  );

  const feedbackMessage =
    usersResult?.meta.message ||
    rewardsResult?.meta.message ||
    analyticsResult?.meta.message;

  if (loading) {
    return (
      <AdminReviewWorkspace
        title="Dashboard Overview"
        description="Review the clearest learner, funnel, and rewards signals first, then use the support panels for detail."
        actions={
          <div className="preview-row">
            <Badge variant="warning">Loading…</Badge>
          </div>
        }
        metricsAriaLabel="Overview metrics"
        metrics={[]}
        primary={null}
        secondary={null}
      />
    );
  }

  return (
    <AdminReviewWorkspace
      title="Dashboard Overview"
      description="Review the clearest learner, funnel, and rewards signals first, then use the support panels for detail."
      actions={
        <div className="preview-row">
          <Badge variant={statsSource === "live" ? "success" : "warning"}>
            {statsSource === "live" ? "Live Data" : "Safe Empty Fallback"}
          </Badge>
          <Button>Export Summary</Button>
        </div>
      }
      {...(feedbackMessage
        ? {
            feedback: (
              <p className="admin-inline-note">{feedbackMessage}</p>
            )
          }
        : {})}
      metricsAriaLabel="Overview metrics"
      metrics={[
        {
          label: "Registered Learners",
          value: String(usersData.users.length),
          trend:
            usersResult?.meta.source === "live"
              ? "Synced from admin users API"
              : "Fallback: no users loaded",
          status: (
            <Badge variant={usersData.users.length > 0 ? "success" : "warning"}>
              Coverage
            </Badge>
          )
        },
        {
          label: "Module Completion",
          value: analyticsData.completionRate,
          trend: "Dynamic from analytics API",
          status: <Badge variant="success">Dynamic</Badge>
        },
        {
          label: "Quiz Pass Rate",
          value: analyticsData.passRate,
          trend: "Dynamic from analytics API",
          status: <Badge variant="info">Dynamic</Badge>
        },
        {
          label: "Rewards Automation",
          value: automationRate,
          trend: "Issued / total rewards",
          status: (
            <Badge variant={issuedCount > 0 ? "success" : "warning"}>
              Dynamic
            </Badge>
          )
        }
      ]}
      primary={
        <AdminReviewTableShell
          title="Operational Review"
          description="Start with the strongest operating signals, then open the support panels below when you need context."
        >
          <Table
            wrapperClassName="admin-review-table-wrap"
            tableClassName="admin-review-table"
            columns={[
              {
                key: "area",
                header: "Area",
                render: (value, row) => (
                  <div className="admin-review-identity">
                    <span className="admin-review-identity__title">{String(value)}</span>
                    <span className="admin-review-identity__meta">{row.summary}</span>
                  </div>
                )
              },
              {
                key: "signal",
                header: "Signal",
                render: (value) => (
                  <span className="admin-review-signal">{String(value)}</span>
                )
              },
              {
                key: "status",
                header: "Status",
                render: (value) => {
                  const statusValue = String(value) as
                    | "Healthy"
                    | "Watch"
                    | "Needs Setup"
                    | "Idle";
                  return (
                    <Badge variant={toStatusVariant(statusValue)}>
                      {statusValue}
                    </Badge>
                  );
                }
              },
              {
                key: "source",
                header: "Source",
                render: (value) => (
                  <span className="admin-review-muted">{String(value)}</span>
                )
              }
            ]}
            rows={operationalRows}
          />
        </AdminReviewTableShell>
      }
      secondary={
        <div className="admin-review-support-grid">
          <Card
            title="Recent Reward Activity"
            description="Most recent airtime reward transactions."
          >
            {rewardRows.length > 0 ? (
              <Table
                wrapperClassName="admin-review-table-wrap admin-review-table-wrap--compact"
                tableClassName="admin-review-table admin-review-table--compact"
                columns={[
                  { key: "learner", header: "Learner" },
                  { key: "module", header: "Module" },
                  { key: "amount", header: "Amount" },
                  {
                    key: "status",
                    header: "Status",
                    render: (value) => (
                      <Badge variant={value === "Issued" ? "success" : "warning"}>
                        {String(value)}
                      </Badge>
                    )
                  }
                ]}
                rows={rewardRows}
              />
            ) : (
              <EmptyState
                title="No reward activity available"
                description="Reward transactions will appear when issuance records are available."
              />
            )}
          </Card>

          <Card
            title="At-Risk Learners"
            description="Learners with low completion needing follow-up support."
          >
            {atRiskRows.length > 0 ? (
              <Table
                wrapperClassName="admin-review-table-wrap admin-review-table-wrap--compact"
                tableClassName="admin-review-table admin-review-table--compact"
                columns={[
                  { key: "learner", header: "Learner" },
                  { key: "location", header: "Location" },
                  { key: "completion", header: "Completion" },
                  {
                    key: "risk",
                    header: "Risk Level",
                    render: (value) => (
                      <Badge variant={value === "High" ? "danger" : "warning"}>
                        {String(value)}
                      </Badge>
                    )
                  }
                ]}
                rows={atRiskRows}
              />
            ) : (
              <EmptyState
                title="No at-risk learner data"
                description="At-risk segments appear here when learner status data is available."
              />
            )}
          </Card>

          <Card
            title="Module Funnel Snapshot"
            description="Current completion funnel from onboarding to module completion."
          >
            <div className="preview-card-content">
              <Tabs
                activeId="funnel"
                items={[
                  {
                    id: "funnel",
                    label: "Funnel",
                    content: analyticsData.funnelOverall
                  },
                  {
                    id: "state",
                    label: "By State",
                    content: analyticsData.funnelAnambra
                  },
                  {
                    id: "language",
                    label: "By Language",
                    content: analyticsData.funnelDelta
                  }
                ]}
              />
            </div>
          </Card>

          <Card
            title="Upcoming Milestones"
            description="Use this support area to track the next threshold learners are approaching."
          >
            <EmptyState
              title="No upcoming milestone events"
              description="Milestone alerts will appear here when learners approach reward thresholds."
              action={
                <Button variant="secondary">Configure Milestone Rule</Button>
              }
            />
          </Card>
        </div>
      }
    />
  );
}
