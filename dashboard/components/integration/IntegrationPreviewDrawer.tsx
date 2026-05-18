"use client";

import { Badge, Button, SideDrawer } from "../ui";
import type {
  IntegrationConnectionResult,
  IntegrationDocumentDetail,
  IntegrationProviderId
} from "./types";
import { maskSecret } from "./types";

type IntegrationPreviewDrawerProps = {
  open: boolean;
  provider: IntegrationProviderId;
  detail: IntegrationDocumentDetail | null;
  history: Array<{ id: string; versionNumber: number; state: "draft" | "published" | "archived" }>;
  connectionResult?: IntegrationConnectionResult | null;
  onClose: () => void;
  onEdit: () => void;
};

function previewRowsForProvider(provider: IntegrationProviderId, payload: Record<string, unknown>) {
  if (provider === "whatsapp") {
    return [
      ["Phone Number ID", String(payload.phoneNumberId ?? "-")],
      ["Business Account ID", String(payload.businessAccountId ?? "-")],
      ["Webhook Path", String(payload.webhookPath ?? "-")],
      ["API Version", String(payload.apiVersion ?? "-")],
      ["Verify Token", maskSecret(String(payload.verifyToken ?? ""))],
      ["Access Token", maskSecret(String(payload.accessToken ?? ""))],
      ["App Secret", maskSecret(String(payload.appSecret ?? ""))]
    ] as const;
  }

  return [
    ["SMTP Host", String(payload.host ?? "-")],
    ["SMTP Port", String(payload.port ?? "-")],
    ["TLS Mode", payload.secure ? "Secure SSL/TLS" : "STARTTLS / Opportunistic"],
    ["Username", String(payload.username ?? "-")],
    ["From Name", String(payload.fromName ?? "-")],
    ["From Email", String(payload.fromEmail ?? "-")],
    ["Reply-To Email", String(payload.replyToEmail ?? "Not set")],
    ["Password", maskSecret(String(payload.password ?? ""))]
  ] as const;
}

export function IntegrationPreviewDrawer({
  open,
  provider,
  detail,
  history,
  connectionResult,
  onClose,
  onEdit
}: IntegrationPreviewDrawerProps) {
  const activePayload = (detail?.draft?.payload ?? detail?.published?.payload ?? {}) as Record<
    string,
    unknown
  >;
  const previewRows = previewRowsForProvider(provider, activePayload);

  return (
    <SideDrawer
      open={open}
      title={provider === "whatsapp" ? "WhatsApp Preview" : "Notification Preview"}
      description="Review the latest draft or live provider settings before editing or publishing."
      onClose={onClose}
      footerActions={
        <div className="integration-preview-drawer__footer">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onEdit}>Edit Settings</Button>
        </div>
      }
    >
      <div className="integration-preview-drawer">
        <div className="integration-preview-drawer__hero">
          <div>
            <p className="integration-preview-drawer__eyebrow">Current Workspace</p>
            <h3 className="integration-preview-drawer__title">
              {detail?.document.title ?? "Integration not created yet"}
            </h3>
            <p className="integration-preview-drawer__meta">
              {detail?.document.key ?? "This provider has not been configured yet."}
            </p>
          </div>
          <div className="integration-preview-drawer__badges">
            <Badge variant={detail?.document.isActive === false ? "warning" : detail?.draft ? "info" : "success"}>
              {detail?.document.isActive === false
                ? "In Trash"
                : detail?.draft
                  ? "Draft Ready"
                  : detail?.published
                    ? "Live"
                    : "Missing"}
            </Badge>
            {connectionResult ? (
              <Badge variant={connectionResult.status === "connected" ? "success" : "danger"}>
                {connectionResult.status === "connected" ? "Connected" : "Needs Attention"}
              </Badge>
            ) : (
              <Badge variant="neutral">Not Tested</Badge>
            )}
          </div>
        </div>

        <div className="integration-preview-drawer__grid">
          {previewRows.map(([label, value]) => (
            <article key={label} className="integration-preview-drawer__card">
              <p className="integration-preview-drawer__label">{label}</p>
              <p className="integration-preview-drawer__value">{value}</p>
            </article>
          ))}
        </div>

        {typeof activePayload.notes === "string" && activePayload.notes.trim().length > 0 ? (
          <section className="integration-preview-drawer__notes">
            <p className="integration-preview-drawer__label">Operational Notes</p>
            <p className="integration-preview-drawer__notes-text">{activePayload.notes}</p>
          </section>
        ) : null}

        <section className="integration-preview-drawer__history">
          <div className="integration-preview-drawer__section-header">
            <h4 className="integration-preview-drawer__section-title">Version History</h4>
            <Badge variant="neutral">{`${history.length} versions`}</Badge>
          </div>
          <div className="integration-preview-drawer__history-list">
            {history.length ? (
              history.map((version) => (
                <div key={version.id} className="integration-preview-drawer__history-item">
                  <span>{`v${version.versionNumber}`}</span>
                  <Badge
                    variant={
                      version.state === "draft"
                        ? "info"
                        : version.state === "published"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {version.state === "draft"
                      ? "Draft"
                      : version.state === "published"
                        ? "Live"
                        : "Archived"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="integration-preview-drawer__notes-text">
                Version history will appear after the first draft is saved.
              </p>
            )}
          </div>
        </section>
      </div>
    </SideDrawer>
  );
}
