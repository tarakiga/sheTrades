"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type SideDrawerSize = "md" | "lg";

export type SideDrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footerActions?: ReactNode;
  onClose: () => void;
  size?: SideDrawerSize;
};

const sizeClassName: Record<SideDrawerSize, string> = {
  md: "ui-side-drawer--md",
  lg: "ui-side-drawer--lg"
};

export function SideDrawer({
  open,
  title,
  description,
  children,
  footerActions,
  onClose,
  size = "md"
}: SideDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
        drawerRef.current?.querySelector<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        ) ?? drawerRef.current;
      focusTarget?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="ui-side-drawer" aria-hidden={!open} suppressHydrationWarning>
      <button
        type="button"
        className="ui-side-drawer__backdrop"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className={`ui-side-drawer__panel ${sizeClassName[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="ui-side-drawer__header">
          <div className="ui-side-drawer__heading">
            <h2 className="ui-side-drawer__title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="ui-side-drawer__description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="ui-side-drawer__close"
            aria-label="Close drawer"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="ui-side-drawer__content">{children}</div>
        {footerActions ? <footer className="ui-side-drawer__footer">{footerActions}</footer> : null}
      </div>
    </div>
  );
}
