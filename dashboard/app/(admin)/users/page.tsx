import { getUsersPageData } from "../../../lib/admin/api";
import { Badge, Button, Card, EmptyState, SectionHeader, Table } from "../../../components/ui";

export default async function UsersPage() {
  const { data, meta } = await getUsersPageData();

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title="Users"
        description="Manage learner records, engagement status, and language distribution."
        actions={
          <div className="preview-row">
            <Badge variant={meta.source === "live" ? "success" : "warning"}>
              {meta.source === "live" ? "Live Data" : "Fallback Data"}
            </Badge>
            <Button>Export Users</Button>
          </div>
        }
      />
      {meta.message ? <p className="admin-inline-note">{meta.message}</p> : null}

      <section className="admin-dashboard-grid">
        <Card
          title="Learner Directory"
          description="Active pilot and production users across locations."
        >
          <Table
            columns={[
              { key: "name", header: "Name" },
              { key: "phone", header: "Phone" },
              { key: "location", header: "Location" },
              { key: "language", header: "Language" },
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
            rows={data.users}
          />
        </Card>

        <Card title="User Actions" description="No user moderation actions are currently pending.">
          <EmptyState
            title="No pending user actions"
            description="Bulk import errors, duplicate merges, and inactive-user actions will appear here."
            action={<Button variant="secondary">Create Import Batch</Button>}
          />
        </Card>
      </section>
    </main>
  );
}
