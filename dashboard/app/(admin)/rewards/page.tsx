import { getRewardsPageData } from "../../../lib/admin/api";
import { Badge, Button, Card, EmptyState, SectionHeader, Table } from "../../../components/ui";

export default async function RewardsPage() {
  const { data, meta } = await getRewardsPageData();

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title="Rewards"
        description="Monitor reward issuance, failures, and manual intervention workflows."
        actions={
          <div className="preview-row">
            <Badge variant={meta.source === "live" ? "success" : "warning"}>
              {meta.source === "live" ? "Live Data" : "Fallback Data"}
            </Badge>
            <Button>Issue Manual Reward</Button>
          </div>
        }
      />
      {meta.message ? <p className="admin-inline-note">{meta.message}</p> : null}

      <section className="admin-dashboard-grid">
        <Card title="Reward Log" description="Latest reward transactions and operational status.">
          <Table
            columns={[
              { key: "learner", header: "Learner" },
              { key: "module", header: "Module" },
              { key: "amount", header: "Amount" },
              { key: "channel", header: "Channel" },
              {
                key: "status",
                header: "Status",
                render: (value) => (
                  <Badge
                    variant={
                      value === "Issued" ? "success" : value === "Pending" ? "warning" : "danger"
                    }
                  >
                    {String(value)}
                  </Badge>
                )
              }
            ]}
            rows={data.rewards}
          />
        </Card>

        <Card title="Exceptions" description="No unresolved reward exceptions at the moment.">
          <EmptyState
            title="No unresolved exceptions"
            description="Failed or disputed rewards will appear here for manual follow-up."
            action={<Button variant="secondary">Open Reconciliation</Button>}
          />
        </Card>
      </section>
    </main>
  );
}
