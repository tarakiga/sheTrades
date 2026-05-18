import {
  AdminInsightPanel,
  AdminInsightSurface,
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Table,
  Tabs
} from "../../../components/ui";

const rewardPreviewRows = [
  {
    learner: "Amina Yusuf",
    module: "Market Access",
    amount: "NGN 500",
    channel: "Airtime",
    status: "Issued"
  },
  {
    learner: "Ruth Okon",
    module: "Digital Sales",
    amount: "NGN 500",
    channel: "Wallet",
    status: "Pending"
  }
];

const reportPreviewRows = [
  {
    report: "Weekly Impact Summary",
    format: "CSV",
    generatedAt: "2026-05-18 10:42 UTC",
    owner: "Ops Lead",
    status: "Ready"
  },
  {
    report: "Rewards Reconciliation",
    format: "PDF",
    generatedAt: "2026-05-18 09:20 UTC",
    owner: "Finance",
    status: "Queued"
  }
];

export function AnalyticsRewardsReportsWorkspacePreview() {
  return (
    <div className="preview-card-content">
      <AdminReviewWorkspace
        as="div"
        title="Analytics workspace"
        description="Insight-led workspace pattern for interpretation-heavy admin routes."
        actions={
          <div className="preview-row">
            <Badge variant="success">Live Data</Badge>
            <Button size="sm">Download Analytics CSV</Button>
          </div>
        }
        metricsAriaLabel="Analytics preview metrics"
        metrics={[
          {
            label: "Registration Rate",
            value: "82%",
            trend: "+2.0% this week",
            status: <Badge variant="success">Healthy</Badge>
          },
          {
            label: "Module Completion",
            value: "34.8%",
            trend: "Progression signal",
            status: <Badge variant="info">Dynamic</Badge>
          },
          {
            label: "Quiz Pass Rate",
            value: "81%",
            trend: "Assessment signal",
            status: <Badge variant="success">On Track</Badge>
          }
        ]}
        primary={
          <AdminInsightSurface
            title="Analytics review canvas"
            description="Lead with the strongest interpretive signals, then keep supporting status quieter."
            summary={
              <div className="admin-insight-surface__badge-row">
                <Badge variant="success">Healthy Sync</Badge>
                <Badge variant="info">Review Ready</Badge>
              </div>
            }
            lead={
              <AdminInsightPanel
                title="Funnel Breakdown"
                description="Tabs can organize analysis inside the surface without becoming the whole page."
              >
                <Tabs
                  activeId="overall"
                  items={[
                    { id: "overall", label: "Overall", content: "72% onboarding to active learning" },
                    { id: "state", label: "By State", content: "Anambra leads current completion velocity" },
                    { id: "language", label: "By Language", content: "Pidgin learners show higher progression this week" }
                  ]}
                />
              </AdminInsightPanel>
            }
            aside={
              <>
                <AdminInsightPanel
                  title="Performance Signals"
                  description="Compact signal blocks remain inside the shared insight surface."
                >
                  <div className="admin-insight-signal-list">
                    <div className="admin-insight-signal-item">
                      <span className="admin-insight-signal-item__label">Completion</span>
                      <strong className="admin-insight-signal-item__value">34.8%</strong>
                    </div>
                    <div className="admin-insight-signal-item">
                      <span className="admin-insight-signal-item__label">Pass Rate</span>
                      <strong className="admin-insight-signal-item__value">81%</strong>
                    </div>
                  </div>
                </AdminInsightPanel>
                <AdminInsightPanel
                  title="Realtime Sync"
                  description="Health and freshness can sit alongside the lead analysis."
                >
                  <LoadingState label="Refreshing analytics stream..." />
                </AdminInsightPanel>
              </>
            }
          />
        }
        secondary={
          <div className="admin-review-support-grid">
            <Card
              title="Operating Notes"
              description="Keep interpretation guidance and fallback notes out of the primary surface."
            >
              <p className="admin-review-support-note">
                Use this quieter zone for operator guidance, degraded-source notes, and lower-priority context.
              </p>
            </Card>
          </div>
        }
      />

      <AdminReviewTableShell
        title="Rewards and reports table shell"
        description="Rewards and reports keep the same dominant review-table structure used by overview and users."
      >
        <Table
          wrapperClassName="admin-review-table-wrap"
          tableClassName="admin-review-table"
          columns={[
            { key: "learner", header: "Learner" },
            { key: "module", header: "Module" },
            { key: "amount", header: "Amount" },
            { key: "channel", header: "Channel" },
            {
              key: "status",
              header: "Status",
              render: (value) => (
                <Badge variant={value === "Issued" ? "success" : "warning"}>{String(value)}</Badge>
              )
            }
          ]}
          rows={rewardPreviewRows}
        />
      </AdminReviewTableShell>

      <AdminReviewTableShell
        title="Export governance shell"
        description="Report history remains the main review surface while presets and scheduling stay secondary."
      >
        <Table
          wrapperClassName="admin-review-table-wrap"
          tableClassName="admin-review-table"
          columns={[
            { key: "report", header: "Report" },
            { key: "format", header: "Format" },
            { key: "generatedAt", header: "Generated At" },
            { key: "owner", header: "Owner" },
            {
              key: "status",
              header: "Status",
              render: (value) => (
                <Badge variant={value === "Ready" ? "success" : "warning"}>{String(value)}</Badge>
              )
            }
          ]}
          rows={reportPreviewRows}
        />
      </AdminReviewTableShell>

      <EmptyState
        title="Support panels stay calmer"
        description="Presets, scheduling states, and exceptions should reinforce the primary surface without competing with it."
      />
    </div>
  );
}
