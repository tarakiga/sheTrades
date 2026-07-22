"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  ConfirmationModal,
  EmptyState,
  Input,
  Select,
  Table
} from "../ui";
import {
  ADMIN_CONFIG_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../lib/admin-config-auth";

type AdminRole = "admin" | "editor" | "viewer";

type ManagedAdmin = {
  id: string;
  fullName: string;
  email: string;
  role: AdminRole;
  status: "active" | "disabled";
  avatarUrl: string;
  lastLoginAt: string | null;
  createdAt: string;
  protected: boolean;
};

type FeedbackState = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type CreateForm = {
  email: string;
  fullName: string;
  role: AdminRole;
  password: string;
};

// The three roles map to backend RBAC (requireRoles) - a structural system set,
// not admin-editable runtime content.
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin - full access incl. managing admins" },
  { value: "editor", label: "Editor - manage content & operations" },
  { value: "viewer", label: "Viewer - read-only" }
];

const ROLE_LABEL: Record<AdminRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer"
};

function emptyCreateForm(): CreateForm {
  return { email: "", fullName: "", role: "editor", password: "" };
}

function decodeJwtSub(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized)) as { sub?: unknown };
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

function formatTimestamp(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminTeamWorkspace() {
  const [token, setToken] = useState("");
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreateForm());
  const [errors, setErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<ManagedAdmin | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedAdmin | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedAdmin | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetError, setResetError] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const selfId = useMemo(() => (token ? decodeJwtSub(token) : null), [token]);

  async function request<T>(path: string, init?: RequestInit, accessToken = token): Promise<T> {
    const response = await fetch(`${ADMIN_CONFIG_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(init?.headers ?? {})
      }
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T & { message?: string });
    if (!response.ok) {
      throw new Error(typeof body.message === "string" ? body.message : "Request failed");
    }
    return body;
  }

  async function refresh(accessToken = token) {
    if (!accessToken) {
      setLoading(false);
      setAdmins([]);
      setLoadError("Sign in as an admin to manage the admin team.");
      return;
    }
    try {
      setLoading(true);
      setLoadError("");
      const data = await request<{ admins: ManagedAdmin[] }>("/api/admin/team", undefined, accessToken);
      setAdmins(data.admins ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/insufficient role|forbidden/i.test(message)) {
        setLoadError("Only admins can manage the admin team.");
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const existing = getStoredAdminConfigToken();
    setToken(existing);
    void refresh(existing);

    function handleTokenUpdated() {
      const next = getStoredAdminConfigToken();
      setToken(next);
      void refresh(next);
    }

    window.addEventListener(ADMIN_CONFIG_TOKEN_UPDATED_EVENT, handleTokenUpdated);
    return () => window.removeEventListener(ADMIN_CONFIG_TOKEN_UPDATED_EVENT, handleTokenUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validateCreate(value: CreateForm) {
    const next: Partial<Record<keyof CreateForm, string>> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (value.fullName.trim().length < 1) {
      next.fullName = "Enter the admin's full name.";
    }
    if (value.password.trim().length < 10) {
      next.password = "Temporary password must be at least 10 characters.";
    }
    return next;
  }

  async function submitCreate() {
    const nextErrors = validateCreate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    try {
      setIsSubmitting(true);
      await request("/api/admin/team", {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          role: form.role,
          password: form.password.trim()
        })
      });
      setFeedback({
        tone: "success",
        text: `Admin created. Share the temporary password with ${form.email.trim()} - they can change it after signing in.`
      });
      setForm(emptyCreateForm());
      setIsCreating(false);
      await refresh();
    } catch (error) {
      setFeedback({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function changeRole(admin: ManagedAdmin, role: AdminRole) {
    if (role === admin.role) return;
    try {
      setPendingRowId(admin.id);
      await request(`/api/admin/team/${encodeURIComponent(admin.id)}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role })
      });
      setFeedback({ tone: "success", text: `${admin.fullName} is now ${ROLE_LABEL[role]}.` });
      await refresh();
    } catch (error) {
      setFeedback({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setPendingRowId(null);
    }
  }

  async function setStatus(admin: ManagedAdmin, action: "suspend" | "reactivate") {
    try {
      setPendingRowId(admin.id);
      await request(`/api/admin/team/${encodeURIComponent(admin.id)}/${action}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setFeedback({
        tone: "success",
        text: action === "suspend" ? `${admin.fullName} suspended.` : `${admin.fullName} reactivated.`
      });
      await refresh();
    } catch (error) {
      setFeedback({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setPendingRowId(null);
      setSuspendTarget(null);
    }
  }

  function openReset(admin: ManagedAdmin) {
    setIsCreating(false);
    setResetTarget(admin);
    setResetValue("");
    setResetError("");
  }

  async function submitReset() {
    if (!resetTarget) return;
    if (resetValue.trim().length < 10) {
      setResetError("Temporary password must be at least 10 characters.");
      return;
    }
    try {
      setIsResetting(true);
      await request(`/api/admin/team/${encodeURIComponent(resetTarget.id)}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: resetValue.trim() })
      });
      setFeedback({
        tone: "success",
        text: `Temporary password set for ${resetTarget.fullName}. Share it securely - they can change it after signing in.`
      });
      setResetTarget(null);
      setResetValue("");
    } catch (error) {
      setResetError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsResetting(false);
    }
  }

  async function deleteAdmin(admin: ManagedAdmin) {
    try {
      setPendingRowId(admin.id);
      await request(`/api/admin/team/${encodeURIComponent(admin.id)}`, { method: "DELETE" });
      setFeedback({ tone: "success", text: `${admin.fullName} deleted.` });
      await refresh();
    } catch (error) {
      setFeedback({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setPendingRowId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <section className="integration-workspace">
      <header className="integration-workspace__header">
        <div>
          <h3 className="integration-workspace__title">Admin Team</h3>
          <p className="integration-workspace__description">
            Add platform admins, assign their role, and suspend access. New admins sign in with a
            temporary password and can change it from their profile.
          </p>
        </div>
        <div className="integration-workspace__header-actions">
          <Button variant="secondary" onClick={() => void refresh()}>
            Reload
          </Button>
          <Button
            onClick={() => {
              setForm(emptyCreateForm());
              setErrors({});
              setIsCreating((open) => !open);
            }}
          >
            {isCreating ? "Close" : "Add Admin"}
          </Button>
        </div>
      </header>

      {feedback ? (
        <div className="settings-workspace__feedback">
          <Badge variant={feedback.tone}>{feedback.text}</Badge>
        </div>
      ) : null}

      {isCreating ? (
        <section className="integration-workspace__editor">
          <div className="integration-workspace__editor-header">
            <div>
              <h4 className="integration-workspace__editor-title">Add Admin</h4>
              <p className="integration-workspace__editor-description">
                Create the account and set a temporary password to share securely.
              </p>
            </div>
          </div>
          <div className="integration-workspace__editor-body">
            <Input
              id="admin-team-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              {...(errors.email ? { error: errors.email } : {})}
            />
            <Input
              id="admin-team-name"
              label="Full name"
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              {...(errors.fullName ? { error: errors.fullName } : {})}
            />
            <Select
              id="admin-team-role"
              label="Role"
              value={form.role}
              options={ROLE_OPTIONS}
              onChange={(value) => setForm({ ...form, role: value as AdminRole })}
            />
            <Input
              id="admin-team-password"
              label="Temporary password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              hint="At least 10 characters. Share it securely; the admin changes it after first sign-in."
              {...(errors.password ? { error: errors.password } : {})}
            />
          </div>
          <div className="integration-workspace__editor-footer">
            <Button variant="secondary" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button loading={isSubmitting} onClick={() => void submitCreate()}>
              Create Admin
            </Button>
          </div>
        </section>
      ) : null}

      {resetTarget ? (
        <section className="integration-workspace__editor">
          <div className="integration-workspace__editor-header">
            <div>
              <h4 className="integration-workspace__editor-title">
                Reset password - {resetTarget.fullName}
              </h4>
              <p className="integration-workspace__editor-description">
                Set a new temporary password and share it securely. {resetTarget.fullName} can
                change it from their profile after signing in.
              </p>
            </div>
          </div>
          <div className="integration-workspace__editor-body">
            <Input
              id="admin-team-reset-password"
              label="New temporary password"
              value={resetValue}
              onChange={(event) => setResetValue(event.target.value)}
              hint="At least 10 characters."
              {...(resetError ? { error: resetError } : {})}
            />
          </div>
          <div className="integration-workspace__editor-footer">
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button loading={isResetting} onClick={() => void submitReset()}>
              Set Temporary Password
            </Button>
          </div>
        </section>
      ) : null}

      {loadError ? (
        <EmptyState title="Access Required" description={loadError} action={undefined} />
      ) : loading ? (
        <div className="integration-workspace__loading">
          <Badge variant="info">Loading admin team…</Badge>
        </div>
      ) : (
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
                    <span className="integration-table__title">
                      {String(value)}
                      {row.id === selfId ? " (you)" : ""}
                    </span>
                    <span className="integration-table__meta">{row.email}</span>
                  </div>
                )
              },
              {
                key: "role",
                header: "Role",
                render: (_value, row) => (
                  <Select
                    id={`role-${row.id}`}
                    className="admin-team-role-select"
                    label={`Role for ${row.fullName}`}
                    value={row.role}
                    options={ROLE_OPTIONS}
                    disabled={row.id === selfId || pendingRowId === row.id}
                    onChange={(value) => void changeRole(row, value as AdminRole)}
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
                  <span className="integration-table__meta">{formatTimestamp(value as string | null)}</span>
                )
              },
              {
                key: "id",
                header: "Actions",
                render: (_value, row) => (
                  <div className="admin-team-actions">
                    <Button
                      variant="secondary"
                      disabled={pendingRowId === row.id}
                      onClick={() => openReset(row)}
                    >
                      Reset password
                    </Button>
                    {row.status === "active" ? (
                      <Button
                        variant="secondary"
                        disabled={row.id === selfId || pendingRowId === row.id}
                        onClick={() => setSuspendTarget(row)}
                      >
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={pendingRowId === row.id}
                        onClick={() => void setStatus(row, "reactivate")}
                      >
                        Reactivate
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      disabled={row.id === selfId || row.protected || pendingRowId === row.id}
                      onClick={() => setDeleteTarget(row)}
                    >
                      Delete
                    </Button>
                  </div>
                )
              }
            ]}
            rows={admins}
          />
        </section>
      )}

      <ConfirmationModal
        open={suspendTarget !== null}
        title="Suspend admin?"
        description={
          suspendTarget
            ? `${suspendTarget.fullName} will be signed out and blocked from signing in until reactivated.`
            : ""
        }
        confirmLabel="Suspend"
        tone="danger"
        cancelLabel="Cancel"
        onCancel={() => setSuspendTarget(null)}
        onConfirm={() => {
          if (suspendTarget) void setStatus(suspendTarget, "suspend");
        }}
      />

      <ConfirmationModal
        open={deleteTarget !== null}
        title="Delete admin?"
        description={
          deleteTarget
            ? `${deleteTarget.fullName} (${deleteTarget.email}) will be permanently removed and can no longer sign in. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
        cancelLabel="Cancel"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void deleteAdmin(deleteTarget);
        }}
      />
    </section>
  );
}
