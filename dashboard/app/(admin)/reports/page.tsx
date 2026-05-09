import { getReportsPageData } from "../../../lib/admin/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeader,
  Table,
  Tabs
} from "../../../components/ui";

export default async function ReportsPage() {
  const { data, meta } = await getReportsPageData();

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title="Reports"
        description="Generate donor-ready exports and monitor report pipeline health."
        actions={
          <div className="preview-row">
            <Badge variant={meta.source === "live" ? "success" : "warning"}>
              {meta.source === "live" ? "Live Data" : "Fallback Data"}
            </Badge>
            <Button>Generate Report</Button>
          </div>
        }
      />
      {meta.message ? <p className="admin-inline-note">{meta.message}</p> : null}

      <section className="admin-dashboard-grid">
        <Card title="Export History" description="Recent report exports and generation status.">
          <Table
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
            rows={data.exports}
          />
        </Card>

        <Card
          title="Report Presets"
          description="Configured export presets by stakeholder profile."
        >
          <Tabs
            activeId="donor"
            items={[
              {
                id: "donor",
                label: "Donor",
                content: "Impact metrics, completion funnel, reward totals."
              },
              {
                id: "ops",
                label: "Ops",
                content: "Daily completion deltas, drop-off list, exceptions."
              },
              {
                id: "finance",
                label: "Finance",
                content: "Reward issuance ledger and reconciliations."
              }
            ]}
          />
        </Card>

        <Card title="Scheduled Jobs" description="No scheduled report jobs configured yet.">
          <EmptyState
            title="No scheduled report jobs"
            description="Create scheduled jobs to automatically generate donor and operations reports."
            action={<Button variant="secondary">Create Schedule</Button>}
          />
        </Card>
      </section>
    </main>
  );
}
