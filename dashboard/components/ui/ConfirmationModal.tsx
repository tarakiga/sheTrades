"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";

type ConfirmationModalTone = "warning" | "danger";

export type ConfirmationModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmationModalTone;
  loading?: boolean;
  confirmHint?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "warning",
  loading = false,
  confirmHint,
  onConfirm,
  onCancel
}: ConfirmationModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const focusTarget =
        panelRef.current?.querySelector<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        ) ?? panelRef.current;
      focusTarget?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [loading, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="ui-modal" aria-hidden={!open} suppressHydrationWarning>
      <button
        type="button"
        className="ui-modal__backdrop"
        aria-label="Close confirmation"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />
      <div
        ref={panelRef}
        className={`ui-modal__panel ui-modal__panel--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="ui-modal__eyebrow">{tone === "danger" ? "Warning" : "Please Confirm"}</div>
        <h2 className="ui-modal__title" id={titleId}>
          {title}
        </h2>
        <p className="ui-modal__description" id={descriptionId}>
          {description}
        </p>
        {confirmHint ? <div className="ui-modal__hint">{confirmHint}</div> : null}
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
