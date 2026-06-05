"use client";

import { Badge, Button, Card, Select, Table } from "../../../components/ui";

type PreviewAdmin = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "active" | "disabled";
  lastLoginAt: string;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" }
];

const MOCK_ADMINS: PreviewAdmin[] = [
  {
    id: "1",
    fullName: "Ada Obi (you)",
    email: "ada@shetrades.com",
    role: "admin",
    status: "active",
    lastLoginAt: "2026-06-04 09:12"
  },
  {
    id: "2",
    fullName: "Chidi Eze",
    email: "chidi@shetrades.com",
    role: "editor",
    status: "active",
    lastLoginAt: "2026-06-03 17:40"
  },
  {
    id: "3",
    fullName: "Ngozi Bello",
    email: "ngozi@shetrades.com",
    role: "viewer",
    status: "disabled",
    lastLoginAt: "2026-05-28 11:02"
  }
];

export function AdminTeamWorkspacePreview() {
  return (
    <div className="preview-card-content">
      <Card
        title="Admin Team — directory + role + status"
        description="Inline role assignment, active/suspended status, and per-row suspend/reactivate. The first row models the signed-in admin (self-actions disabled)."
      >
        <section className="integration-workspace__table-shell">
          <Table
            wrapperClassName="integration-table-wrap"
            tableClassName="integration-table"
            emptyMessage="No admins yet."
            columns={[
              {
                key: "fullName",
                header: "Admin",
                render: (value, row) => (
                  <div className="integration-table__identity">
                    <span className="integration-table__title">{String(value)}</span>
                    <span className="integration-table__meta">{row.email}</span>
                  </div>
                )
              },
              {
                key: "role",
                header: "Role",
                render: (_value, row) => (
                  <Select
                    id={`preview-role-${row.id}`}
                    className="admin-team-role-select"
                    label={`Role for ${row.fullName}`}
                    value={row.role}
                    options={ROLE_OPTIONS}
                    disabled={row.id === "1"}
                    onChange={() => undefined}
                  />
                )
              },
              {
                key: "status",
                header: "Status",
                render: (value) => (
                  <Badge variant={value === "active" ? "success" : "warning"}>
                    {value === "active" ? "Active" : "Suspended"}
                  </Badge>
                )
              },
              {
                key: "lastLoginAt",
                header: "Last sign-in",
                render: (value) => (
                  <span className="integration-table__meta">{String(value)}</span>
                )
              },
              {
                key: "id",
                header: "Actions",
                render: (_value, row) =>
                  row.status === "active" ? (
                    <Button variant="secondary" disabled={row.id === "1"} onClick={() => undefined}>
                      Suspend
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => undefined}>
                      Reactivate
                    </Button>
                  )
              }
            ]}
            rows={MOCK_ADMINS}
          />
        </section>
      </Card>
    </div>
  );
}
