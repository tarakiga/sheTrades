"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input } from "../ui";
import {
  ADMIN_CONFIG_API_BASE_URL,
  getStoredAdminConfigToken,
  saveStoredAdminConfigToken
} from "../../lib/admin-config-auth";

type SessionResponse = {
  actor?: {
    role?: "viewer" | "editor" | "admin";
  };
};

type AdminAccessKeyPanelProps = {
  copy: Record<string, string>;
  title?: string;
  description?: string;
};

type AuthFeedback = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

export function AdminAccessKeyPanel({
  copy,
  title,
  description
}: AdminAccessKeyPanelProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState("unknown");
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const t = useMemo(
    () => (key: string, fallback: string) => {
      const value = copy[key];
      return typeof value === "string" && value.trim().length > 0 ? value : fallback;
    },
    [copy]
  );

  useEffect(() => {
    const existing = getStoredAdminConfigToken();
    setTokenInput(existing);
    setToken(existing);
  }, []);

  async function requestSession(accessToken: string) {
    const response = await fetch(`${ADMIN_CONFIG_API_BASE_URL}/api/config/admin/session`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`
      }
    });
    const body = (await response.json()) as { message?: string } & SessionResponse;
    if (!response.ok) {
      throw new Error(
        typeof body.message === "string"
          ? body.message
          : t("configAdmin.error.requestFailed", "Request failed")
      );
    }
    return body;
  }

  function saveToken() {
    const trimmedToken = tokenInput.trim();
    if (!trimmedToken) {
      setFeedback({
        tone: "warning",
        text: t("configAdmin.auth.emptyKey", "Paste your access key before saving.")
      });
      return;
    }

    saveStoredAdminConfigToken(trimmedToken);
    setToken(trimmedToken);
    setFeedback({
      tone: "success",
      text: t(
        "configAdmin.message.tokenSaved",
        "Access key saved in this browser. Click Reload to confirm access."
      )
    });
  }

  async function refreshAccess() {
    if (!token) {
      setFeedback({
        tone: "warning",
        text: t("configAdmin.auth.missingKey", "Paste and save your access key first.")
      });
      return;
    }

    try {
      setIsRefreshing(true);
      setFeedback({
        tone: "info",
        text: t("configAdmin.auth.refreshing", "Checking your access and loading settings...")
      });
      const session = await requestSession(token);
      setRole(session.actor?.role ?? "unknown");
      setFeedback({
        tone: "success",
        text: t("configAdmin.auth.ready", "Access confirmed. Settings are ready.")
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="settings-access-panel">
      <div className="settings-access-panel__copy">
        <h3 className="settings-access-panel__title">
          {title ?? t("integration.access.title", "Access And Connection Key")}
        </h3>
        <p className="settings-access-panel__description">
          {description ??
            t(
              "integration.access.description",
              "Save your admin access key here so integration settings, tests, and publish controls can load securely."
            )}
        </p>
      </div>

      <div className="settings-access-bar">
        <div className="settings-access-bar__field">
          <Input
            id="settings-access-key"
            label={t("configAdmin.auth.tokenLabel", "Access Key")}
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder={t("configAdmin.auth.tokenPlaceholder", "Paste your access key")}
          />
        </div>
        <div className="settings-access-bar__actions">
          <Button onClick={saveToken} disabled={isRefreshing}>
            {t("configAdmin.auth.saveToken", "Save Key")}
          </Button>
          <Button variant="secondary" loading={isRefreshing} onClick={() => void refreshAccess()}>
            {t("configAdmin.actions.refresh", "Reload")}
          </Button>
          <Badge variant="info">{`${t("configAdmin.auth.role", "Access Level")}: ${role}`}</Badge>
        </div>
        <p className="settings-access-bar__hint">
          {t(
            "configAdmin.auth.help",
            "Save your access key, then click Reload to confirm your access."
          )}
        </p>
        {feedback ? (
          <div className="preview-row">
            <Badge variant={feedback.tone}>{feedback.text}</Badge>
          </div>
        ) : null}
      </div>
    </section>
  );
}
