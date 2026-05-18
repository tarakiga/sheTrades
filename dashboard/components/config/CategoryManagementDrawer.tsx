"use client";

import { Badge, Button, EmptyState, Input, SideDrawer } from "../ui";

export type CategoryManagerItem = {
  id: string;
  value: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
};

type WorkflowFeedback = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

export type CategoryManagementDrawerProps = {
  open: boolean;
  namespaceLabel: string;
  title: string;
  description: string;
  helperText: string;
  items: Array<CategoryManagerItem>;
  feedback?: WorkflowFeedback | null;
  onAddCategory: () => void;
  onLabelChange: (id: string, value: string) => void;
  onValueChange: (id: string, value: string) => void;
  onToggleEnabled: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  savingDraft: boolean;
  publishing: boolean;
  publishDisabled?: boolean;
};

export function CategoryManagementDrawer({
  open,
  namespaceLabel,
  title,
  description,
  helperText,
  items,
  feedback,
  onAddCategory,
  onLabelChange,
  onValueChange,
  onToggleEnabled,
  onReorder,
  onClose,
  onSaveDraft,
  onPublish,
  savingDraft,
  publishing,
  publishDisabled = false
}: CategoryManagementDrawerProps) {
  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      description={description}
      footerActions={
        <div className="config-drawer__footer">
          <div className="config-drawer__footer-group config-drawer__footer-group--utility">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="config-drawer__footer-group config-drawer__footer-group--primary">
            <Button
              variant="secondary"
              disabled={publishDisabled}
              loading={publishing}
              onClick={onPublish}
            >
              Publish Live
            </Button>
            <Button loading={savingDraft} onClick={onSaveDraft}>
              Save Draft
            </Button>
          </div>
        </div>
      }
    >
      <div className="category-drawer">
        <div className="settings-editor-drawer__meta">
          <Badge variant="info">{namespaceLabel}</Badge>
          <Badge variant="neutral">Manage Categories</Badge>
        </div>

        <div className="category-drawer__intro">
          <p className="category-drawer__helper">{helperText}</p>
          <Button size="sm" onClick={onAddCategory}>
            Add Category
          </Button>
        </div>

        {items.length ? (
          <div className="category-drawer__list">
            {items.map((item, index) => (
              <section key={item.id} className="category-drawer__item">
                <div className="category-drawer__item-head">
                  <div className="category-drawer__badges">
                    <Badge variant={item.enabled ? "success" : "neutral"}>
                      {item.enabled ? "Enabled" : "Hidden"}
                    </Badge>
                    <Badge variant="neutral">#{index + 1}</Badge>
                  </div>
                  <div className="category-drawer__actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => onReorder(item.id, "up")}
                    >
                      Move Up
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === items.length - 1}
                      onClick={() => onReorder(item.id, "down")}
                    >
                      Move Down
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onToggleEnabled(item.id)}>
                      {item.enabled ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>

                <div className="category-drawer__fields">
                  <Input
                    id={`category-label-${item.id}`}
                    label="Category Name"
                    value={item.label}
                    placeholder="What people should see"
                    onChange={(event) => onLabelChange(item.id, event.target.value)}
                  />
                  <Input
                    id={`category-value-${item.id}`}
                    label="Internal Value"
                    value={item.value}
                    placeholder="lesson"
                    onChange={(event) => onValueChange(item.id, event.target.value)}
                  />
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No categories yet"
            description="Add your first category to help people build internal names without typing the whole structure."
            action={<Button onClick={onAddCategory}>Add Category</Button>}
          />
        )}

        {feedback ? (
          <div className="preview-row">
            <Badge variant={feedback.tone}>{feedback.text}</Badge>
          </div>
        ) : null}
      </div>
    </SideDrawer>
  );
}
