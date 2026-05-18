"use client";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";

export type PublishWorkflowPanelProps = {
  draftVersionLabel: string;
  publishedVersionLabel: string;
  lastPublishedBy: string;
  lastPublishedAt: string;
  hasChanges: boolean;
  labels?: {
    title: string;
    description: string;
    currentDraft: string;
    publishedVersion: string;
    unpublishedChanges: string;
    noChanges: string;
    previewDraft: string;
    publish: string;
    rollback: string;
    by: string;
  };
  onPreviewDraft?: () => void;
  onPublish?: () => void;
  onRollback?: () => void;
};

export function PublishWorkflowPanel({
  draftVersionLabel,
  publishedVersionLabel,
  lastPublishedBy,
  lastPublishedAt,
  hasChanges,
  labels,
  onPreviewDraft,
  onPublish,
  onRollback
}: PublishWorkflowPanelProps) {
  const ui = labels ?? {
    title: "Draft and Publish Workflow",
    description: "Preview changes, publish approved drafts, or rollback to previous versions.",
    currentDraft: "Current Draft",
    publishedVersion: "Published Version",
    unpublishedChanges: "Unpublished Changes",
    noChanges: "No Changes",
    previewDraft: "Preview Draft",
    publish: "Publish",
    rollback: "Rollback",
    by: "by"
  };

  return (
    <Card title={ui.title} description={ui.description}>
      <div className="publish-panel">
        <div className="publish-panel__states">
          <div className="publish-panel__state-block">
            <p className="publish-panel__label">{ui.currentDraft}</p>
            <p className="publish-panel__value">{draftVersionLabel}</p>
            <Badge variant={hasChanges ? "warning" : "neutral"}>
              {hasChanges ? ui.unpublishedChanges : ui.noChanges}
            </Badge>
          </div>
          <div className="publish-panel__state-block">
            <p className="publish-panel__label">{ui.publishedVersion}</p>
            <p className="publish-panel__value">{publishedVersionLabel}</p>
            <p className="publish-panel__meta">
              {lastPublishedAt} {ui.by} {lastPublishedBy}
            </p>
          </div>
        </div>
        <div className="publish-panel__actions">
          <Button variant="secondary" onClick={onPreviewDraft}>
            {ui.previewDraft}
          </Button>
          <Button onClick={onPublish} disabled={!hasChanges}>
            {ui.publish}
          </Button>
          <Button variant="ghost" onClick={onRollback}>
            {ui.rollback}
          </Button>
        </div>
      </div>
    </Card>
  );
}
