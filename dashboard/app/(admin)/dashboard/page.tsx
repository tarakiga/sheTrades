import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  SectionHeader,
  StatCard,
  Table,
  Tabs
} from "../../../components/ui";

type RewardRow = {
  learner: string;
  module: string;
  amount: string;
  status: "Issued" | "Pending";
};

type RiskRow = {
  learner: string;
  location: string;
  completion: string;
  risk: "High" | "Medium";
};

const rewardRows: Array<RewardRow> = [
  { learner: "Amaka Obi", module: "Module 2", amount: "NGN 200", status: "Issued" },
  { learner: "Ruth Okon", module: "Module 1", amount: "NGN 200", status: "Pending" },
  { learner: "Mariam Bello", module: "Module 3", amount: "NGN 300", status: "Issued" }
];

const atRiskRows: Array<RiskRow> = [
  { learner: "Ngozi Eze", location: "Anambra", completion: "22%", risk: "High" },
  { learner: "Gift James", location: "Delta", completion: "31%", risk: "Medium" }
];

export default function AdminDashboardOverviewPage() {
  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title="Dashboard Overview"
        description="Live view of learner performance, module funnel, and reward operations."
        actions={<Button>Export Summary</Button>}
      />

      <section className="ui-stat-grid" aria-label="Overview metrics">
        <StatCard
          label="Registered Learners"
          value="20,412"
          trend="+7.8% this month"
          status={<Badge variant="success">Healthy</Badge>}
        />
        <StatCard
          label="Module Completion"
          value="34.8%"
          trend="+4.2% this week"
          status={<Badge variant="success">Above target</Badge>}
        />
        <StatCard
          label="Quiz Pass Rate"
          value="63.1%"
          trend="+1.1% this week"
          status={<Badge variant="info">Monitoring</Badge>}
        />
        <StatCard
          label="Rewards Automation"
          value="98.6%"
          trend="-0.4% today"
          status={<Badge variant="warning">Investigate</Badge>}
        />
      </section>

      <section className="admin-dashboard-grid">
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
                  content:
                    "Onboarding 20,412 -> Module Start 13,907 -> Quiz Attempt 8,112 -> Module Complete 7,104"
                },
                { id: "state", label: "By State", content: "Anambra 55% | Delta 45%" },
                {
                  id: "language",
                  label: "By Language",
                  content: "English 47% | Pidgin 39% | Igbo 14%"
                }
              ]}
            />
            <LoadingState label="Syncing latest analytics snapshot..." />
          </div>
        </Card>

        <Card title="Recent Reward Activity" description="Most recent airtime reward transactions.">
          <Table
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
        </Card>

        <Card
          title="At-Risk Learners"
          description="Learners with low completion needing follow-up support."
        >
          <Table
            columns={[
              { key: "learner", header: "Learner" },
              { key: "location", header: "Location" },
              { key: "completion", header: "Completion" },
              {
                key: "risk",
                header: "Risk Level",
                render: (value) => (
                  <Badge variant={value === "High" ? "danger" : "warning"}>{String(value)}</Badge>
                )
              }
            ]}
            rows={atRiskRows}
          />
        </Card>

        <Card title="Upcoming Milestones" description="No milestone events are currently queued.">
          <EmptyState
            title="No upcoming milestone events"
            description="Milestone alerts will appear here when learners approach reward thresholds."
            action={<Button variant="secondary">Configure Milestone Rule</Button>}
          />
        </Card>
      </section>
    </main>
  );
}
