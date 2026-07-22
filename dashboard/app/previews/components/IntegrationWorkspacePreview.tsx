"use client";

import { useState } from "react";
import { Badge, Button, Card, Table, Tabs } from "../../../components/ui";
import { IntegrationConfigDrawer } from "../../../components/integration/IntegrationConfigDrawer";
import { IntegrationPreviewDrawer } from "../../../components/integration/IntegrationPreviewDrawer";
import { RewardRulesWorkspace } from "../../../components/integration/RewardRulesWorkspace";
import {
  createEmptyNotificationForm,
  createEmptyWhatsAppForm,
  type IntegrationConnectionResult
} from "../../../components/integration/types";

export function IntegrationWorkspacePreview() {
  const [drawerProvider, setDrawerProvider] = useState<"whatsapp" | "notification" | null>(null);
  const [previewProvider, setPreviewProvider] = useState<"whatsapp" | "notification" | null>(null);

  const whatsappConnectionResult: IntegrationConnectionResult = {
    provider: "meta_whatsapp_cloud",
    status: "connected",
    summary: "WhatsApp connected for +234800000001.",
    details: "Verified name: SheTrades",
    testedAt: "2026-05-17T12:00:00.000Z"
  };

  const smtpConnectionResult: IntegrationConnectionResult = {
    provider: "smtp",
    status: "failed",
    summary: "SMTP connection failed.",
    details: "535 Authentication credentials invalid",
    testedAt: "2026-05-17T12:12:00.000Z"
  };

  return (
    <div className="preview-card-content">

      <Card
        title="Integration Provider Tabs"
        description="Top-level nested tabs for WhatsApp, Notification, and Payouts provider workspaces."
      >
        <Tabs
          activeId="whatsapp"
          items={[
            {
              id: "whatsapp",
              label: "WhatsApp",
              content: (
                <div className="preview-card-content">
                  <div className="preview-row">
                    <Badge variant="info">Draft Ready</Badge>
                    <Badge variant="success">Connected</Badge>
                  </div>
                  <Table
                    columns={[
                      { key: "title", header: "Integration" },
                      { key: "status", header: "Status" },
                      { key: "health", header: "Health" },
                      { key: "updated", header: "Updated" }
                    ]}
                    rows={[
                      {
                        title: "Primary WhatsApp Integration",
                        status: "Draft Ready",
                        health: "Connected",
                        updated: "17 May 2026, 12:00"
                      }
                    ]}
                  />
                  <div className="preview-row">
                    <Button variant="secondary" onClick={() => setPreviewProvider("whatsapp")}>
                      Open Preview
                    </Button>
                    <Button onClick={() => setDrawerProvider("whatsapp")}>Open Drawer</Button>
                  </div>
                </div>
              )
            },
            {
              id: "notification",
              label: "Notification",
              content: (
                <div className="preview-card-content">
                  <div className="preview-row">
                    <Badge variant="warning">Draft Ready</Badge>
                    <Badge variant="danger">Needs Attention</Badge>
                  </div>
                  <Table
                    columns={[
                      { key: "title", header: "Integration" },
                      { key: "status", header: "Status" },
                      { key: "health", header: "Health" },
                      { key: "updated", header: "Updated" }
                    ]}
                    rows={[
                      {
                        title: "Primary SMTP Notification Integration",
                        status: "Draft Ready",
                        health: "Connection Failed",
                        updated: "17 May 2026, 12:12"
                      }
                    ]}
                  />
                  <div className="preview-row">
                    <Button variant="secondary" onClick={() => setPreviewProvider("notification")}>
                      Open Preview
                    </Button>
                    <Button onClick={() => setDrawerProvider("notification")}>Open Drawer</Button>
                  </div>
                </div>
              )
            },
            {
              id: "payouts",
              label: "Payouts",
              content: (
                <div className="preview-card-content">
                  <div className="preview-row">
                    <Badge variant="success">Live</Badge>
                    <Badge variant="neutral">Africa's Talking (sandbox)</Badge>
                  </div>
                  <Table
                    columns={[
                      { key: "title", header: "Integration" },
                      { key: "status", header: "Status" },
                      { key: "updated", header: "Updated" }
                    ]}
                    rows={[
                      {
                        title: "Primary Payouts Integration",
                        status: "Live",
                        updated: "17 May 2026, 12:24"
                      }
                    ]}
                  />
                  <p>
                    Live form (provider selector + credential fields) is rendered inline beneath
                    the table. See the dedicated &quot;Payouts Integration&quot; preview for the
                    selector and credential field components.
                  </p>
                </div>
              )
            }
          ]}
        />
      </Card>

      <IntegrationConfigDrawer
        open={drawerProvider === "whatsapp"}
        provider="whatsapp"
        mode="edit"
        value={{
          ...createEmptyWhatsAppForm(),
          verifyToken: "verify-token-1234",
          accessToken: "access-token-1234",
          appSecret: "app-secret-1234",
          phoneNumberId: "123456789",
          businessAccountId: "987654321",
          notes: "Primary production sender"
        }}
        errors={{}}
        connectionResult={whatsappConnectionResult}
        onChange={() => undefined}
        onClose={() => setDrawerProvider(null)}
        onSubmit={() => undefined}
        onTestConnection={() => undefined}
      />

      <IntegrationConfigDrawer
        open={drawerProvider === "notification"}
        provider="notification"
        mode="edit"
        value={{
          ...createEmptyNotificationForm(),
          host: "smtp.example.com",
          username: "notifications",
          password: "password",
          fromEmail: "noreply@example.com",
          replyToEmail: "support@example.com",
          notes: "Primary transactional sender"
        }}
        errors={{ port: "Use a valid SMTP port." }}
        connectionResult={smtpConnectionResult}
        onChange={() => undefined}
        onClose={() => setDrawerProvider(null)}
        onSubmit={() => undefined}
        onTestConnection={() => undefined}
      />

      <IntegrationPreviewDrawer
        open={previewProvider === "whatsapp"}
        provider="whatsapp"
        detail={{
          document: {
            id: "doc-1",
            key: "integration.whatsapp.primary",
            type: "integration_config",
            title: "Primary WhatsApp Integration",
            updatedAt: "2026-05-17T12:00:00.000Z",
            isActive: true,
            namespace: "integration"
          },
          draft: {
            id: "draft-1",
            versionNumber: 2,
            state: "draft",
            payload: {
              title: "Primary WhatsApp Integration",
              provider: "meta_whatsapp_cloud",
              enabled: true,
              verifyToken: "verify-token-1234",
              accessToken: "access-token-1234",
              appSecret: "app-secret-1234",
              phoneNumberId: "123456789",
              businessAccountId: "987654321",
              webhookPath: "/webhook/whatsapp",
              apiVersion: "v23.0",
              notes: "Primary production sender"
            }
          },
          published: null
        }}
        history={[
          { id: "v2", versionNumber: 2, state: "draft" },
          { id: "v1", versionNumber: 1, state: "archived" }
        ]}
        connectionResult={whatsappConnectionResult}
        onClose={() => setPreviewProvider(null)}
        onEdit={() => setDrawerProvider("whatsapp")}
      />

      <IntegrationPreviewDrawer
        open={previewProvider === "notification"}
        provider="notification"
        detail={{
          document: {
            id: "doc-2",
            key: "integration.notification.smtp",
            type: "integration_config",
            title: "Primary SMTP Notification Integration",
            updatedAt: "2026-05-17T12:12:00.000Z",
            isActive: true,
            namespace: "integration"
          },
          draft: {
            id: "draft-2",
            versionNumber: 3,
            state: "draft",
            payload: {
              title: "Primary SMTP Notification Integration",
              provider: "smtp",
              enabled: true,
              host: "smtp.example.com",
              port: 587,
              secure: false,
              username: "notifications",
              password: "password",
              fromName: "SheTrades",
              fromEmail: "noreply@example.com",
              replyToEmail: "support@example.com",
              notes: "Primary transactional sender"
            }
          },
          published: null
        }}
        history={[
          { id: "v3", versionNumber: 3, state: "draft" },
          { id: "v2", versionNumber: 2, state: "published" },
          { id: "v1", versionNumber: 1, state: "archived" }
        ]}
        connectionResult={smtpConnectionResult}
        onClose={() => setPreviewProvider(null)}
        onEdit={() => setDrawerProvider("notification")}
      />

      <Card
        title="Reward Rules Workspace"
        description="Inline workspace for the reward.rules.primary config document. Renders in create-mode/empty state when no live document exists."
      >
        <RewardRulesWorkspace />
      </Card>
    </div>
  );
}
