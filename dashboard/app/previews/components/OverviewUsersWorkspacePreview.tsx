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

type PreviewRow = {
  title: string;
  summary: string;
  signal: string;
  status: string;
  source: string;
};

const overviewRows: Array<PreviewRow> = [
  {
    title: "Learner coverage",
    summary: "18,420 registered learners across active cohorts",
    signal: "92% verified profile coverage",
    status: "Healthy",
    source: "Live"
  },
  {
    title: "Module progression",
    summary: "Completion and pass rates remain above weekly baseline",
    signal: "34.8% completion, 81% pass rate",
    status: "Watch",
    source: "Live"
  }
];

const userRows = [
  {
    learner: "Aisha Bello",
    phone: "+234 803 000 1111",
    location: "Lagos",
    language: "English",
    completion: "82%",
    status: "Active"
  },
  {
    learner: "Ruth Okon",
    phone: "+234 809 000 2222",
    location: "Delta",
    language: "Pidgin",
    completion: "23%",
    status: "At Risk"
  }
];

export function OverviewUsersWorkspacePreview() {
  return (
    <div className="preview-card-content">
      <AdminReviewWorkspace
        as="div"
        title="Overview workspace"
        description="Shared premium workspace pattern with a dominant review surface and a calmer support zone."
        actions={
          <div className="preview-row">
            <Badge variant="success">Live Data</Badge>
            <Button size="sm">Export Summary</Button>
          </div>
        }
        metricsAriaLabel="Overview preview metrics"
        metrics={[
          {
            label: "Registered Learners",
            value: "18,420",
            trend: "+12.4% this month",
            status: <Badge variant="success">Healthy</Badge>
          },
          {
            label: "Rewards Automation",
            value: "86.0%",
            trend: "Issued / total rewards",
            status: <Badge variant="info">Dynamic</Badge>
          }
        ]}
        primary={
          <AdminReviewTableShell
            title="Operational Review"
            description="Lead with the clearest operating signals, then use the support panels for deeper context."
          >
            <Table
              wrapperClassName="admin-review-table-wrap"
              tableClassName="admin-review-table"
              columns={[
                {
                  key: "title",
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
                  render: (value) => <span className="admin-review-signal">{String(value)}</span>
                },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "Healthy" ? "success" : "warning"}>{String(value)}</Badge>
                  )
                },
                {
                  key: "source",
                  header: "Source",
                  render: (value) => <span className="admin-review-muted">{String(value)}</span>
                }
              ]}
              rows={overviewRows}
            />
          </AdminReviewTableShell>
        }
        secondary={
          <div className="admin-review-support-grid">
            <Card
              title="Support panel"
              description="Secondary blocks stay quieter and reinforce the primary review surface."
            >
              <p className="admin-review-support-note">
                Use these panels for exceptions, snapshots, and contextual summaries.
              </p>
            </Card>
          </div>
        }
      />

      <AdminReviewTableShell
        title="Users directory shell"
        description="Preview-ready action rails fit naturally into the shared table structure."
      >
        <Table
          wrapperClassName="admin-review-table-wrap"
          tableClassName="admin-review-table admin-review-table--users"
          columns={[
            {
              key: "learner",
              header: "Learner",
              render: (value, row) => (
                <div className="users-directory__identity">
                  <span className="users-directory__name">{String(value)}</span>
                  <span className="users-directory__meta">{row.phone}</span>
                </div>
              )
            },
            { key: "location", header: "Location" },
            { key: "language", header: "Language" },
            { key: "completion", header: "Progress" },
            {
              key: "status",
              header: "Status",
              render: (value) => (
                <Badge variant={value === "Active" ? "success" : "warning"}>{String(value)}</Badge>
              )
            },
            {
              key: "learner",
              header: "",
              render: (_value, row) => (
                <AdminActionRail
                  actions={[
                    {
                      id: `${row.learner}-preview`,
                      label: "Preview learner profile",
                      icon: "preview"
                    },
                    {
                      id: `${row.learner}-message`,
                      label: "Contact learner",
                      icon: "message",
                      disabled: true
                    },
                    {
                      id: `${row.learner}-flag`,
                      label: "Flag for follow-up",
                      icon: "flag",
                      tone: "danger",
                      disabled: true
                    }
                  ]}
                />
              )
            }
          ]}
          rows={userRows}
        />
      </AdminReviewTableShell>

      <EmptyState
        title="Future action states fit the same system"
        description="The action rail is ready for side drawers and moderation flows without needing another table redesign."
      />
    </div>
  );
}
