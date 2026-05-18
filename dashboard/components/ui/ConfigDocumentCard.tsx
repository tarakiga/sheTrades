"use client";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";

type ConfigState = "draft" | "published" | "archived";

export type ConfigDocumentCardProps = {
  namespace: "content" | "options" | "legal";
  keyName: string;
  title: string;
  state: ConfigState;
  versionLabel: string;
  updatedAtLabel: string;
  updatedByLabel: string;
  labels?: {
    namespace: string;
    version: string;
    updated: string;
    editor: string;
    viewHistory: string;
    editDraft: string;
  };
  onEdit?: () => void;
  onViewHistory?: () => void;
};

function toBadgeVariant(state: ConfigState) {
  if (state === "published") return "success";
  if (state === "draft") return "warning";
  return "neutral";
}

export function ConfigDocumentCard({
  namespace,
  keyName,
  title,
  state,
  versionLabel,
  updatedAtLabel,
  updatedByLabel,
  labels,
  onEdit,
  onViewHistory
}: ConfigDocumentCardProps) {
  const ui = labels ?? {
    namespace: "Namespace",
    version: "Version",
    updated: "Updated",
    editor: "Editor",
    viewHistory: "View History",
    editDraft: "Edit Draft"
  };

  return (
    <Card title={title} description={`${ui.namespace}: ${namespace}`}>
      <div className="config-doc-card">
        <div className="config-doc-card__meta">
          <Badge variant={toBadgeVariant(state)}>{state.toUpperCase()}</Badge>
          <p className="config-doc-card__key">{keyName}</p>
        </div>
        <dl className="config-doc-card__details">
          <div>
            <dt>{ui.version}</dt>
            <dd>{versionLabel}</dd>
          </div>
          <div>
            <dt>{ui.updated}</dt>
            <dd>{updatedAtLabel}</dd>
          </div>
          <div>
            <dt>{ui.editor}</dt>
            <dd>{updatedByLabel}</dd>
          </div>
        </dl>
        <div className="config-doc-card__actions">
          <Button variant="secondary" size="sm" onClick={onViewHistory}>
            {ui.viewHistory}
          </Button>
          <Button size="sm" onClick={onEdit}>
            {ui.editDraft}
          </Button>
        </div>
      </div>
    </Card>
  );
}
