import { getAnalyticsPageData } from "../../../lib/admin/api";
import {
  Badge,
  Button,
  Card,
  LoadingState,
  SectionHeader,
  StatCard,
  Tabs
} from "../../../components/ui";

export default async function AnalyticsPage() {
  const { data, meta } = await getAnalyticsPageData();

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title="Analytics"
        description="Track registration, progression, and quiz performance across modules."
        actions={
          <div className="preview-row">
            <Badge variant={meta.source === "live" ? "success" : "warning"}>
              {meta.source === "live" ? "Live Data" : "Fallback Data"}
            </Badge>
            <Button>Download Analytics CSV</Button>
          </div>
        }
      />
      {meta.message ? <p className="admin-inline-note">{meta.message}</p> : null}

      <section className="ui-stat-grid" aria-label="Analytics metrics">
        <StatCard label="Registration Rate" value={data.registrationRate} trend="+2.0% this week" />
        <StatCard
          label="Module Completion"
          value={data.completionRate}
          trend="+4.2% this week"
          status={<Badge variant="success">Target met</Badge>}
        />
        <StatCard label="Quiz Pass Rate" value={data.passRate} trend="+1.1% this week" />
      </section>

      <section className="admin-dashboard-grid">
        <Card
          title="Funnel Breakdown"
          description="Learner progression through onboarding and modules."
        >
          <Tabs
            activeId="overall"
            items={[
              {
                id: "overall",
                label: "Overall",
                content: data.funnelOverall
              },
              { id: "anambra", label: "Anambra", content: data.funnelAnambra },
              { id: "delta", label: "Delta", content: data.funnelDelta }
            ]}
          />
        </Card>

        <Card
          title="Realtime Sync"
          description="Streaming analytics updates from WhatsApp events pipeline."
        >
          <LoadingState label="Refreshing analytics stream..." />
        </Card>
      </section>
    </main>
  );
}
