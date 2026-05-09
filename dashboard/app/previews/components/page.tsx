import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  SectionHeader,
  Select,
  StatCard,
  Table,
  Tabs
} from "../../../components/ui";
import { AdminShell } from "../../../components/layout/AdminShell";

type LearnerRow = {
  name: string;
  state: string;
  completion: string;
  status: "Active" | "At Risk";
};

const learnerRows: Array<LearnerRow> = [
  { name: "Amaka Obi", state: "Anambra", completion: "78%", status: "Active" },
  { name: "Ruth Okon", state: "Delta", completion: "34%", status: "At Risk" }
];

export default function ComponentsPreviewPage() {
  return (
    <main className="preview-page">
      <SectionHeader
        title="Component Library Preview"
        description="Review reusable component states before they are composed into product pages."
        actions={<Badge variant="info">Preview v1</Badge>}
      />

      <div className="preview-grid">
        <Card
          title="Buttons"
          description="Primary, secondary, ghost, danger, loading, and disabled states."
        >
          <div className="preview-card-content">
            <div className="preview-row">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="preview-row">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Card>

        <Card title="Inputs" description="Label, hint, and validation error states.">
          <div className="preview-card-content">
            <Input
              id="name"
              label="Learner Name"
              placeholder="Enter full name"
              hint="As shown on registration."
            />
            <Input
              id="phone"
              label="Phone Number"
              placeholder="+234..."
              defaultValue="08000000000"
              error="Invalid phone format."
            />
          </div>
        </Card>

        <Card
          title="Badges"
          description="Semantic and neutral status labels for analytics and workflow state."
        >
          <div className="preview-row">
            <Badge variant="neutral">Draft</Badge>
            <Badge variant="info">In Review</Badge>
            <Badge variant="success">Active</Badge>
            <Badge variant="warning">Pending</Badge>
            <Badge variant="danger">Failed</Badge>
          </div>
        </Card>

        <Card title="Select + Tabs" description="Form selection and tab navigation primitives.">
          <div className="preview-card-content">
            <Select
              id="language"
              label="Preferred Language"
              hint="Used for lesson text and audio defaults."
              options={[
                { label: "English", value: "en" },
                { label: "Pidgin", value: "pcm" },
                { label: "Igbo", value: "ig" }
              ]}
              defaultValue="en"
            />
            <Tabs
              activeId="users"
              items={[
                { id: "users", label: "Users", content: "User analytics module content preview." },
                {
                  id: "content",
                  label: "Content",
                  content: "Learning content module content preview."
                },
                {
                  id: "rewards",
                  label: "Rewards",
                  content: "Reward processing module content preview."
                }
              ]}
            />
          </div>
        </Card>

        <Card
          title="Table + StatCard"
          description="Data display primitives for dashboard analytics pages."
        >
          <div className="preview-card-content">
            <div className="ui-stat-grid">
              <StatCard label="Registered Users" value="20,412" trend="+12.4% this month" />
              <StatCard
                label="Module Completion"
                value="34.8%"
                trend="+4.2% this week"
                status={<Badge variant="success">On Track</Badge>}
              />
            </div>
            <Table
              columns={[
                { key: "name", header: "Name" },
                { key: "state", header: "State" },
                { key: "completion", header: "Completion" },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "Active" ? "success" : "warning"}>
                      {String(value)}
                    </Badge>
                  )
                }
              ]}
              rows={learnerRows}
            />
          </div>
        </Card>

        <Card title="Empty + Loading States" description="Graceful empty and loading placeholders.">
          <div className="preview-card-content">
            <LoadingState label="Loading learner analytics..." />
            <EmptyState
              title="No rewards issued yet"
              description="Rewards will appear here once learners complete milestone quizzes."
              action={<Button variant="secondary">Issue Manual Reward</Button>}
            />
          </div>
        </Card>

        <Card
          title="Admin Shell Layout"
          description="Reusable sidebar + topbar shell used across all admin routes."
        >
          <div className="admin-shell-preview">
            <AdminShell>
              <main className="admin-dashboard-page">
                <SectionHeader
                  title="Shell Content Slot"
                  description="Child pages render into this content region."
                />
              </main>
            </AdminShell>
          </div>
        </Card>
      </div>
    </main>
  );
}
