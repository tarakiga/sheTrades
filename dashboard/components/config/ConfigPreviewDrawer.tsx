"use client";

import { Badge, Button, SideDrawer } from "../ui";

type PreviewDocumentType = "lesson_content" | "option_set" | "legal_block" | "ui_copy";

type PreviewVersion = {
  id: string;
  versionNumber: number;
  state: "draft" | "published" | "archived";
};

type PreviewDetail = {
  document: {
    id: string;
    key: string;
    type: PreviewDocumentType;
    title: string;
    updatedAt: string;
    isActive: boolean;
    namespace?: "content" | "options" | "legal";
  };
  draft: {
    id: string;
    versionNumber: number;
    payload?: Record<string, unknown>;
  } | null;
  published: {
    id: string;
    versionNumber: number;
    payload?: Record<string, unknown>;
  } | null;
};

export type ConfigPreviewDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string;
  detail: PreviewDetail | null;
  history: Array<PreviewVersion>;
  title: string;
  description: string;
  closeLabel: string;
  historyLabel: string;
  editLabel: string;
  trashLabel: string;
  restoreLabel: string;
  onClose: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onTrashOrRestore: () => void;
  trashLoading?: boolean;
  formatPayload: (payload: Record<string, unknown> | undefined) => string;
  getStatusLabel: (detail: PreviewDetail | null) => string;
  getTypeFieldLabel: (detail: PreviewDetail | null) => string;
  getTypeLabel: (detail: PreviewDetail | null) => string;
};

export function ConfigPreviewDrawer({
  open,
  loading,
  error,
  detail,
  history,
  title,
  description,
  closeLabel,
  historyLabel,
  editLabel,
  trashLabel,
  restoreLabel,
  onClose,
  onHistory,
  onEdit,
  onTrashOrRestore,
  trashLoading = false,
  formatPayload,
  getStatusLabel,
  getTypeFieldLabel,
  getTypeLabel
}: ConfigPreviewDrawerProps) {
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
              {closeLabel}
            </Button>
            <Button variant="secondary" onClick={onHistory}>
              {historyLabel}
            </Button>
          </div>
          <div className="config-drawer__footer-group config-drawer__footer-group--primary">
            <Button
              variant={detail?.document.isActive === false ? "secondary" : "ghost"}
              loading={trashLoading}
              onClick={onTrashOrRestore}
            >
              {detail?.document.isActive === false ? restoreLabel : trashLabel}
            </Button>
            <Button onClick={onEdit}>{editLabel}</Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <p>Loading item details...</p>
      ) : error ? (
        <Badge variant="danger">{error}</Badge>
      ) : detail ? (
        <div className="config-preview">
          <div className="config-preview__grid">
            <div>
              <p className="config-preview__label">Item Name</p>
              <p className="config-preview__value">{detail.document.key}</p>
            </div>
            <div>
              <p className="config-preview__label">{getTypeFieldLabel(detail)}</p>
              <p className="config-preview__value">{getTypeLabel(detail)}</p>
            </div>
            <div>
              <p className="config-preview__label">Status</p>
              <p className="config-preview__value">{getStatusLabel(detail)}</p>
            </div>
            <div>
              <p className="config-preview__label">Last Updated</p>
              <p className="config-preview__value">{detail.document.updatedAt}</p>
            </div>
            <div>
              <p className="config-preview__label">Draft Version</p>
              <p className="config-preview__value">
                {detail.draft ? `v${detail.draft.versionNumber}` : "-"}
              </p>
            </div>
            <div>
              <p className="config-preview__label">Live Version</p>
              <p className="config-preview__value">
                {detail.published ? `v${detail.published.versionNumber}` : "-"}
              </p>
            </div>
          </div>
          <div>
            <p className="config-preview__label">Draft Preview</p>
            <pre className="config-preview__code">{formatPayload(detail.draft?.payload)}</pre>
          </div>
          {detail.published ? (
            <div>
              <p className="config-preview__label">Live Preview</p>
              <pre className="config-preview__code">{formatPayload(detail.published.payload)}</pre>
            </div>
          ) : null}
          <div>
            <p className="config-preview__label">Recent Versions</p>
            <div className="config-preview__actions">
              {history.length ? (
                history.slice(0, 3).map((item) => (
                  <Badge key={item.id} variant={item.state === "published" ? "success" : "neutral"}>
                    {`v${item.versionNumber} ${item.state}`}
                  </Badge>
                ))
              ) : (
                <Badge variant="neutral">No saved history yet</Badge>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p>Choose an item to preview its details.</p>
      )}
    </SideDrawer>
  );
}
