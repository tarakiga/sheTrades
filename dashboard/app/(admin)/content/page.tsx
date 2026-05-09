import { getContentPageData } from "../../../lib/admin/api";
import { Badge, Button, Card, EmptyState, SectionHeader, Table } from "../../../components/ui";

export default async function ContentPage() {
  const { data, meta } = await getContentPageData();

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title="Content"
        description="Manage lesson text, audio variants, and quiz structures."
        actions={
          <div className="preview-row">
            <Badge variant={meta.source === "live" ? "success" : "warning"}>
              {meta.source === "live" ? "Live Data" : "Fallback Data"}
            </Badge>
            <Button>Create Lesson</Button>
          </div>
        }
      />
      {meta.message ? <p className="admin-inline-note">{meta.message}</p> : null}

      <section className="admin-dashboard-grid">
        <Card
          title="Lesson Library"
          description="Current content inventory by module and readiness."
        >
          <Table
            columns={[
              { key: "module", header: "Module" },
              { key: "lesson", header: "Lesson" },
              { key: "language", header: "Languages" },
              { key: "quiz", header: "Quiz" },
              {
                key: "status",
                header: "Status",
                render: (value) => (
                  <Badge variant={value === "Published" ? "success" : "neutral"}>
                    {String(value)}
                  </Badge>
                )
              }
            ]}
            rows={data.lessons}
          />
        </Card>

        <Card
          title="Translation Queue"
          description="No translation jobs are currently waiting for review."
        >
          <EmptyState
            title="No translation queue items"
            description="New translation tasks appear here when source content is updated."
            action={<Button variant="secondary">Request Translation</Button>}
          />
        </Card>
      </section>
    </main>
  );
}
