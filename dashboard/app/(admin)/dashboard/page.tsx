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
import { getAnalyticsPageData, getRewardsPageData, getUsersPageData } from "../../../lib/admin/api";
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";

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

export default async function AdminDashboardOverviewPage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  const [usersResult, rewardsResult, analyticsResult] = await Promise.all([
    getUsersPageData(),
    getRewardsPageData(),
    getAnalyticsPageData()
  ]);

  const rewardRows = rewardsResult.data.rewards.slice(0, 5).map((row) => ({
    learner: row.learner,
    module: row.module,
    amount: row.amount,
    status: row.status === "Issued" ? "Issued" : "Pending"
  }));

  const atRiskRows = usersResult.data.users
    .filter((row) => row.status === "At Risk")
    .slice(0, 5)
    .map((row) => ({
      learner: row.name,
      location: row.location,
      completion: row.completion,
      risk: toRisk(row.completion)
    }));

  const statsSource = [
    usersResult.meta.source,
    rewardsResult.meta.source,
    analyticsResult.meta.source
  ].every((item) => item === "live")
    ? "live"
    : "fallback";

  const issuedCount = rewardsResult.data.rewards.filter((row) => row.status === "Issued").length;
  const totalRewards = rewardsResult.data.rewards.length;
  const automationRate =
    totalRewards === 0 ? "0.0%" : `${((issuedCount / totalRewards) * 100).toFixed(1)}%`;
  const funnelReady = !analyticsResult.data.funnelOverall.startsWith("No published");
  const operationalRows = [
    {
      area: t("dashboard.operational.learners.title", "Learner Coverage"),
      summary:
        usersResult.data.users.length > 0
          ? t("dashboard.operational.learners.summary", "Registered learner records are flowing into the directory.")
          : t("dashboard.operational.learners.empty", "No learner records are available in the current source."),
      signal: t("dashboard.operational.learners.signal", "{{count}} learner records available").replace(
        "{{count}}",
        String(usersResult.data.users.length)
      ),
      status:
        usersResult.data.users.length > 0
          ? ("Healthy" as const)
          : ("Needs Setup" as const),
      source:
        usersResult.meta.source === "live"
          ? t("common.liveData", "Live Data")
          : t("common.fallbackData", "Fallback Data")
    },
    {
      area: t("dashboard.operational.progress.title", "Module Progression"),
      summary: t(
        "dashboard.operational.progress.summary",
        "Completion and quiz performance remain the clearest learning health signals."
      ),
      signal: `${analyticsResult.data.completionRate} ${t("dashboard.operational.progress.signalJoin", "completion")} / ${analyticsResult.data.passRate} ${t("dashboard.operational.progress.signalPass", "pass rate")}`,
      status: toNumber(analyticsResult.data.completionRate) > 0 ? ("Healthy" as const) : ("Watch" as const),
      source:
        analyticsResult.meta.source === "live"
          ? t("common.liveData", "Live Data")
          : t("common.fallbackData", "Fallback Data")
    },
    {
      area: t("dashboard.operational.rewards.title", "Reward Delivery"),
      summary: t(
        "dashboard.operational.rewards.summary",
        "Reward automation shows whether learner completion is flowing through to issuance."
      ),
      signal: `${automationRate} ${t("dashboard.operational.rewards.signalJoin", "automation across")} ${totalRewards} ${t("dashboard.operational.rewards.signalTotal", "reward events")}`,
      status: totalRewards > 0 ? ("Healthy" as const) : ("Idle" as const),
      source:
        rewardsResult.meta.source === "live"
          ? t("common.liveData", "Live Data")
          : t("common.fallbackData", "Fallback Data")
    },
    {
      area: t("dashboard.operational.funnel.title", "Funnel Readiness"),
      summary: funnelReady
        ? t(
            "dashboard.operational.funnel.summaryReady",
            "The current funnel snapshot is ready to review by cohort and state."
          )
        : t(
            "dashboard.operational.funnel.summaryEmpty",
            "The funnel still needs a published analytics configuration before it becomes useful."
          ),
      signal: funnelReady
        ? t("dashboard.operational.funnel.signalReady", "Funnel snapshots are available")
        : t("dashboard.operational.funnel.signalEmpty", "Waiting for published funnel data"),
      status: funnelReady ? ("Healthy" as const) : ("Needs Setup" as const),
      source:
        analyticsResult.meta.source === "live"
          ? t("common.liveData", "Live Data")
          : t("common.fallbackData", "Fallback Data")
    }
  ];

  return (
    <AdminReviewWorkspace
      title={t("dashboard.title", "Dashboard Overview")}
      description={t(
        "dashboard.description",
        "Overview of platform operations, learner progress, and reward fulfillment."
      )}
      actions={
        <div className="preview-row">
          <Badge variant={statsSource === "live" ? "success" : "neutral"}>
            {statsSource === "live"
              ? t("common.liveData", "Live Data")
              : t("common.safeEmptyFallback", "Safe Empty Fallback")}
          </Badge>
          <Button>{t("dashboard.actions.exportSummary", "Export Summary")}</Button>
        </div>
      }
      {...(usersResult.meta.message || rewardsResult.meta.message || analyticsResult.meta.message
        ? {
            feedback: (
              <p className="admin-inline-note">
                {usersResult.meta.message || rewardsResult.meta.message || analyticsResult.meta.message}
              </p>
            )
          }
        : {})}
      metricsAriaLabel={t("dashboard.metricsAria", "Overview metrics")}
      metrics={[
        {
          label: t("dashboard.metrics.registeredLearners", "Registered Learners"),
          value: String(usersResult.data.users.length),
          trend:
            usersResult.meta.source === "live"
              ? t("dashboard.trends.usersLive", "Synced from admin users API")
              : t("dashboard.trends.usersFallback", "Fallback: no users loaded"),
          status: (
            <Badge variant={usersResult.data.users.length > 0 ? "success" : "warning"}>
              {t("dashboard.badges.coverage", "Coverage")}
            </Badge>
          )
        },
        {
          label: t("dashboard.metrics.moduleCompletion", "Module Completion"),
          value: analyticsResult.data.completionRate,
          trend: t("dashboard.trends.analyticsDynamic", "Dynamic from analytics API"),
          status: <Badge variant="success">{t("dashboard.badges.dynamic", "Dynamic")}</Badge>
        },
        {
          label: t("dashboard.metrics.quizPassRate", "Quiz Pass Rate"),
          value: analyticsResult.data.passRate,
          trend: t("dashboard.trends.analyticsDynamic", "Dynamic from analytics API"),
          status: <Badge variant="info">{t("dashboard.badges.dynamic", "Dynamic")}</Badge>
        },
        {
          label: t("dashboard.metrics.rewardsAutomation", "Rewards Automation"),
          value: automationRate,
          trend: t("dashboard.trends.rewardsAutomation", "Issued / total rewards"),
          status: (
            <Badge variant={issuedCount > 0 ? "success" : "warning"}>
              {t("dashboard.badges.dynamic", "Dynamic")}
            </Badge>
          )
        }
      ]}
      primary={
        <AdminReviewTableShell
          title={t("dashboard.workspace.primary.title", "Operational Review")}
          description={t(
            "dashboard.workspace.primary.description",
            "High-level summary of system health and operational readiness."
          )}
        >
          <Table
            wrapperClassName="admin-review-table-wrap"
            tableClassName="admin-review-table"
            columns={[
              {
                key: "area",
                header: t("dashboard.workspace.columns.area", "Area"),
                render: (value, row) => (
                  <div className="admin-review-identity">
                    <span className="admin-review-identity__title">{String(value)}</span>
                    <span className="admin-review-identity__meta">{row.summary}</span>
                  </div>
                )
              },
              {
                key: "signal",
                header: t("dashboard.workspace.columns.signal", "Signal"),
                render: (value) => <span className="admin-review-signal">{String(value)}</span>
              },
              {
                key: "status",
                header: t("common.columns.status", "Status"),
                render: (value) => {
                  const statusValue = String(value) as "Healthy" | "Watch" | "Needs Setup" | "Idle";
                  return (
                    <Badge variant={toStatusVariant(statusValue)}>
                      {statusValue}
                    </Badge>
                  );
                }
              },
              {
                key: "source",
                header: t("dashboard.workspace.columns.source", "Source"),
                render: (value) => <span className="admin-review-muted">{String(value)}</span>
              }
            ]}
            rows={operationalRows}
          />
        </AdminReviewTableShell>
      }
      secondary={
        <div className="admin-review-support-grid">
          <Card
            title={t("dashboard.cards.rewardActivity.title", "Recent Reward Activity")}
            description={t(
              "dashboard.cards.rewardActivity.description",
              "Most recent airtime reward transactions."
            )}
          >
            {rewardRows.length > 0 ? (
              <Table
                wrapperClassName="admin-review-table-wrap admin-review-table-wrap--compact"
                tableClassName="admin-review-table admin-review-table--compact"
                columns={[
                  { key: "learner", header: t("common.columns.learner", "Learner") },
                  { key: "module", header: t("common.columns.module", "Module") },
                  { key: "amount", header: t("common.columns.amount", "Amount") },
                  {
                    key: "status",
                    header: t("common.columns.status", "Status"),
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
                icon="rewards"
                title={t("dashboard.empty.rewardActivity.title", "No reward activity available")}
                description={t(
                  "dashboard.empty.rewardActivity.description",
                  "Reward transactions will appear when issuance records are available."
                )}
              />
            )}
          </Card>

          <Card
            title={t("dashboard.cards.atRisk.title", "At-Risk Learners")}
            description={t(
              "dashboard.cards.atRisk.description",
              "Learners with low completion needing follow-up support."
            )}
          >
            {atRiskRows.length > 0 ? (
              <Table
                wrapperClassName="admin-review-table-wrap admin-review-table-wrap--compact"
                tableClassName="admin-review-table admin-review-table--compact"
                columns={[
                  { key: "learner", header: t("common.columns.learner", "Learner") },
                  { key: "location", header: t("common.columns.location", "Location") },
                  { key: "completion", header: t("common.columns.completion", "Completion") },
                  {
                    key: "risk",
                    header: t("dashboard.columns.riskLevel", "Risk Level"),
                    render: (value) => (
                      <Badge variant={value === "High" ? "danger" : "warning"}>{String(value)}</Badge>
                    )
                  }
                ]}
                rows={atRiskRows}
              />
            ) : (
              <EmptyState
                icon="users"
                title={t("dashboard.empty.atRisk.title", "No at-risk learner data")}
                description={t(
                  "dashboard.empty.atRisk.description",
                  "At-risk segments appear here when learner status data is available."
                )}
              />
            )}
          </Card>

          <Card
            title={t("dashboard.cards.funnel.title", "Module Funnel Snapshot")}
            description={t(
              "dashboard.cards.funnel.description",
              "Current completion funnel from onboarding to module completion."
            )}
          >
            <div className="preview-card-content">
              <Tabs
                activeId="funnel"
                items={[
                  {
                    id: "funnel",
                    label: t("dashboard.tabs.funnel", "Funnel"),
                    content: analyticsResult.data.funnelOverall
                  },
                  {
                    id: "state",
                    label: t("dashboard.tabs.byState", "By State"),
                    content: analyticsResult.data.funnelAnambra
                  },
                  {
                    id: "language",
                    label: t("dashboard.tabs.byLanguage", "By Language"),
                    content: analyticsResult.data.funnelDelta
                  }
                ]}
              />
            </div>
          </Card>

          <Card
            title={t("dashboard.cards.milestones.title", "Upcoming Milestones")}
            description={t(
              "dashboard.cards.milestones.description",
              "Track learners approaching reward thresholds and engagement milestones."
            )}
          >
            <EmptyState
              icon="analytics"
              title={t("dashboard.empty.milestones.title", "No upcoming milestone events")}
              description={t(
                "dashboard.empty.milestones.description",
                "Milestone alerts will appear here when learners approach reward thresholds."
              )}
              action={
                <Button variant="secondary">
                  {t("dashboard.actions.configureMilestoneRule", "Configure Milestone Rule")}
                </Button>
              }
            />
          </Card>
        </div>
      }
    />
  );
}
