"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input, Select, SideDrawer, Textarea } from "../ui";
import type { IntegrationConnectionResult, IntegrationFormState, IntegrationProviderId } from "./types";
import { isWhatsAppForm } from "./types";

type IntegrationConfigDrawerProps = {
  open: boolean;
  provider: IntegrationProviderId;
  mode: "create" | "edit";
  value: IntegrationFormState;
  errors: Record<string, string>;
  feedback?: {
    tone: "info" | "success" | "warning" | "danger";
    text: string;
  } | null;
  connectionResult?: IntegrationConnectionResult | null;
  isSubmitting?: boolean;
  isTesting?: boolean;
  onChange: (field: string, value: string | boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
  onTestConnection: () => void;
};

type SecretFieldProps = {
  id: string;
  label: string;
  value: string;
  hint: string;
  error?: string | undefined;
  onChange: (value: string) => void;
};

function SecretField({ id, label, value, hint, error, onChange }: SecretFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const withError = error ? { error } : {};

  return (
    <div className="integration-config-drawer__secret-field">
      <Input
        id={id}
        label={label}
        type={revealed ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        hint={hint}
        {...withError}
      />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? "Hide" : "Reveal"}
      </Button>
    </div>
  );
}

function resultVariant(
  tone: IntegrationConnectionResult["status"] | NonNullable<IntegrationConfigDrawerProps["feedback"]>["tone"]
) {
  switch (tone) {
    case "connected":
    case "success":
      return "success" as const;
    case "failed":
    case "danger":
      return "danger" as const;
    case "invalid":
    case "warning":
      return "warning" as const;
    default:
      return "info" as const;
  }
}

export function IntegrationConfigDrawer({
  open,
  provider,
  mode,
  value,
  errors,
  feedback,
  connectionResult,
  isSubmitting = false,
  isTesting = false,
  onChange,
  onClose,
  onSubmit,
  onTestConnection
}: IntegrationConfigDrawerProps) {
  const isWhatsApp = isWhatsAppForm(value);
  const withError = (error?: string) => (error ? { error } : {});
  const title = useMemo(
    () =>
      provider === "whatsapp"
        ? mode === "create"
          ? "Set Up WhatsApp"
          : "Edit WhatsApp Settings"
        : mode === "create"
          ? "Set Up Notification"
          : "Edit Notification Settings",
    [mode, provider]
  );

  return (
    <SideDrawer
      open={open}
      title={title}
      description="Save draft changes, run a safe connection test, then publish when the provider details are ready."
      onClose={onClose}
      size="lg"
      footerActions={
        <div className="integration-config-drawer__footer">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="ghost" loading={isTesting} onClick={onTestConnection}>
            Test Connection
          </Button>
          <Button loading={isSubmitting} onClick={onSubmit}>
            {mode === "create" ? "Save Draft" : "Update Draft"}
          </Button>
        </div>
      }
    >
      <div className="integration-config-drawer">
        <div className="integration-config-drawer__grid">
          <Input
            id={`${provider}-title`}
            label="Integration Title"
            value={value.title}
            onChange={(event) => onChange("title", event.target.value)}
            hint="Use a clear operational name so admins know which connection is active."
            {...withError(errors.title)}
          />
          <Input
            id={`${provider}-provider`}
            label="Provider"
            value={isWhatsApp ? "Meta WhatsApp Cloud" : "SMTP Email"}
            disabled
            hint="This workspace is pre-scoped to the selected provider."
          />
          <Select
            id={`${provider}-enabled`}
            label="Status"
            value={value.enabled ? "enabled" : "disabled"}
            options={[
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" }
            ]}
            onChange={(next) => onChange("enabled", next === "enabled")}
            hint="Disabled integrations keep their configuration but do not represent the active live connection."
          />
          {isWhatsApp ? (
            <>
              <Input
                id="whatsapp-phone-number-id"
                label="Phone Number ID"
                value={value.phoneNumberId}
                onChange={(event) => onChange("phoneNumberId", event.target.value)}
                hint="Meta uses this number ID to identify the WhatsApp sending line."
                {...withError(errors.phoneNumberId)}
              />
              <Input
                id="whatsapp-business-account-id"
                label="Business Account ID"
                value={value.businessAccountId}
                onChange={(event) => onChange("businessAccountId", event.target.value)}
                hint="Optional, but useful for operational traceability."
              />
              <Input
                id="whatsapp-webhook-path"
                label="Webhook Path"
                value={value.webhookPath}
                onChange={(event) => onChange("webhookPath", event.target.value)}
                hint="This is the callback path Meta uses for webhook verification and inbound events."
                {...withError(errors.webhookPath)}
              />
              <Input
                id="whatsapp-api-version"
                label="API Version"
                value={value.apiVersion}
                onChange={(event) => onChange("apiVersion", event.target.value)}
                hint="Use the matching Graph API version provisioned for your WhatsApp app."
                {...withError(errors.apiVersion)}
              />
              <SecretField
                id="whatsapp-verify-token"
                label="Verify Token"
                value={value.verifyToken}
                onChange={(next) => onChange("verifyToken", next)}
                hint="Used by Meta during webhook verification."
                {...withError(errors.verifyToken)}
              />
              <SecretField
                id="whatsapp-access-token"
                label="Access Token"
                value={value.accessToken}
                onChange={(next) => onChange("accessToken", next)}
                hint="Used for outbound provider API access and connection testing."
                {...withError(errors.accessToken)}
              />
              <SecretField
                id="whatsapp-app-secret"
                label="App Secret"
                value={value.appSecret}
                onChange={(next) => onChange("appSecret", next)}
                hint="Optional in this phase, but required for stronger webhook signature validation."
                {...withError(errors.appSecret)}
              />
            </>
          ) : (
            <>
              <Input
                id="notification-host"
                label="SMTP Host"
                value={value.host}
                onChange={(event) => onChange("host", event.target.value)}
                hint="Use the hostname supplied by your email provider."
                {...withError(errors.host)}
              />
              <Input
                id="notification-port"
                label="SMTP Port"
                value={value.port}
                onChange={(event) => onChange("port", event.target.value)}
                hint="Common values are 465 for SSL or 587 for STARTTLS."
                {...withError(errors.port)}
              />
              <Select
                id="notification-secure"
                label="TLS Mode"
                value={value.secure ? "secure" : "starttls"}
                options={[
                  { value: "secure", label: "Secure SSL/TLS" },
                  { value: "starttls", label: "STARTTLS / Opportunistic" }
                ]}
                onChange={(next) => onChange("secure", next === "secure")}
                hint="Choose the connection mode required by your provider."
              />
              <Input
                id="notification-username"
                label="Username"
                value={value.username}
                onChange={(event) => onChange("username", event.target.value)}
                hint="Used to authenticate with your SMTP provider."
                {...withError(errors.username)}
              />
              <SecretField
                id="notification-password"
                label="Password"
                value={value.password}
                onChange={(next) => onChange("password", next)}
                hint="Used only for authenticated email delivery and connection verification."
                {...withError(errors.password)}
              />
              <Input
                id="notification-from-name"
                label="From Name"
                value={value.fromName}
                onChange={(event) => onChange("fromName", event.target.value)}
                hint="This appears as the sender name in email notifications."
                {...withError(errors.fromName)}
              />
              <Input
                id="notification-from-email"
                label="From Email"
                value={value.fromEmail}
                onChange={(event) => onChange("fromEmail", event.target.value)}
                hint="Use the approved sender email for transactional messages."
                {...withError(errors.fromEmail)}
              />
              <Input
                id="notification-reply-to-email"
                label="Reply-To Email"
                value={value.replyToEmail}
                onChange={(event) => onChange("replyToEmail", event.target.value)}
                hint="Optional. Leave blank if replies should use the sender address."
                {...withError(errors.replyToEmail)}
              />
            </>
          )}
        </div>

        <Textarea
          id={`${provider}-notes`}
          label="Operational Notes"
          value={value.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          rows={5}
          hint="Use this space for admin-facing context such as environment, ownership, or provider restrictions."
        />

        {feedback ? (
          <div className="integration-config-drawer__feedback">
            <Badge variant={resultVariant(feedback.tone)}>{feedback.text}</Badge>
          </div>
        ) : null}

        {connectionResult ? (
          <div className="integration-config-drawer__result">
            <div className="integration-config-drawer__result-header">
              <h4 className="integration-config-drawer__result-title">Latest Connection Test</h4>
              <Badge variant={resultVariant(connectionResult.status)}>
                {connectionResult.status === "connected"
                  ? "Connected"
                  : connectionResult.status === "invalid"
                    ? "Invalid Configuration"
                    : "Connection Failed"}
              </Badge>
            </div>
            <p className="integration-config-drawer__result-summary">{connectionResult.summary}</p>
            {connectionResult.details ? (
              <p className="integration-config-drawer__result-details">{connectionResult.details}</p>
            ) : null}
            <p className="integration-config-drawer__result-meta">
              Tested at {new Date(connectionResult.testedAt).toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
    </SideDrawer>
  );
}
