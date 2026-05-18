"use client";

import type { ReactNode } from "react";
import { Badge, Button, Input, SideDrawer, Textarea } from "../ui";

type WorkflowFeedback = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type DrawerTemplate = {
  id: string;
  label: string;
};

export type ConfigEditorDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  namespaceLabel: string;
  title: string;
  description: string;
  keyLabel: string;
  keyValue: string;
  keyPlaceholder: string;
  onKeyChange: (value: string) => void;
  keyField?: ReactNode;
  titleLabel?: string;
  titleValue?: string;
  titlePlaceholder?: string;
  onTitleChange?: (value: string) => void;
  payloadLabel: string;
  payloadValue: string;
  payloadPlaceholder: string;
  payloadHint?: string;
  onPayloadChange: (value: string) => void;
  keyReadOnly?: boolean;
  feedback?: WorkflowFeedback | null;
  templates?: Array<DrawerTemplate>;
  onTemplateSelect?: (templateId: string) => void;
  saving: boolean;
  primaryActionLabel: string;
  primaryActionDisabled?: boolean;
  onPrimaryAction: () => void;
  secondaryActions?: ReactNode;
  onClose: () => void;
};

export function ConfigEditorDrawer({
  open,
  mode,
  namespaceLabel,
  title,
  description,
  keyLabel,
  keyValue,
  keyPlaceholder,
  onKeyChange,
  keyField,
  titleLabel,
  titleValue = "",
  titlePlaceholder = "",
  onTitleChange,
  payloadLabel,
  payloadValue,
  payloadPlaceholder,
  payloadHint,
  onPayloadChange,
  keyReadOnly = false,
  feedback,
  templates = [],
  onTemplateSelect,
  saving,
  primaryActionLabel,
  primaryActionDisabled = false,
  onPrimaryAction,
  secondaryActions,
  onClose
}: ConfigEditorDrawerProps) {
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
            {secondaryActions}
          </div>
          <div className="config-drawer__footer-group config-drawer__footer-group--primary">
            <Button disabled={primaryActionDisabled} loading={saving} onClick={onPrimaryAction}>
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="settings-editor-drawer">
        <div className="settings-editor-drawer__meta">
          <Badge variant="info">{namespaceLabel}</Badge>
          <Badge variant="neutral">{mode === "create" ? "New Item" : "Editing Draft"}</Badge>
        </div>
        {keyField ?? (
          <Input
            id="config-editor-key"
            label={keyLabel}
            value={keyValue}
            readOnly={keyReadOnly}
            onChange={(event) => onKeyChange(event.target.value)}
            placeholder={keyPlaceholder}
          />
        )}
        {titleLabel && onTitleChange ? (
          <Input
            id="config-editor-title"
            label={titleLabel}
            value={titleValue}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={titlePlaceholder}
          />
        ) : null}
        <Textarea
          id="config-editor-payload"
          label={payloadLabel}
          value={payloadValue}
          onChange={(event) => onPayloadChange(event.target.value)}
          placeholder={payloadPlaceholder}
          rows={14}
          spellCheck={false}
          {...(payloadHint ? { hint: payloadHint } : {})}
        />
        {templates.length && onTemplateSelect ? (
          <div className="settings-editor-drawer__templates">
            <p className="settings-editor-drawer__templates-label">Quick starters</p>
            <div className="preview-row">
              {templates.map((template) => (
                <Button
                  key={template.id}
                  variant="secondary"
                  size="sm"
                  onClick={() => onTemplateSelect(template.id)}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {feedback ? (
          <div className="preview-row">
            <Badge variant={feedback.tone}>{feedback.text}</Badge>
          </div>
        ) : null}
      </div>
    </SideDrawer>
  );
}
