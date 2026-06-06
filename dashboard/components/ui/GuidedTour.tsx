"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement
} from "react";
import { createPortal } from "react-dom";

export type TourStep = {
  /** CSS selector for the element to spotlight. Omit for a centered step. */
  target?: string;
  title: string;
  body: string;
};

export type GuidedTourLabels = {
  back: string;
  next: string;
  skip: string;
  done: string;
  stepOf: string; // e.g. "Step {current} of {total}"
};

export type GuidedTourProps = {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
  labels?: Partial<GuidedTourLabels>;
};

type SpotRect = { top: number; left: number; width: number; height: number } | null;

const DEFAULT_LABELS: GuidedTourLabels = {
  back: "Back",
  next: "Next",
  skip: "Skip tour",
  done: "Done",
  stepOf: "Step {current} of {total}"
};

const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 360;
const CARD_GAP = 16;

export function GuidedTour({ open, steps, onClose, labels }: GuidedTourProps): ReactElement | null {
  const merged = { ...DEFAULT_LABELS, ...labels };
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<SpotRect>(null);
  const [card, setCard] = useState<{ top: number; left: number; placement: "below" | "above" | "center" }>({
    top: 0,
    left: 0,
    placement: "center"
  });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const step = steps[index];
  const total = steps.length;
  const isLast = index === total - 1;

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const measure = useCallback(() => {
    if (!step) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;

    if (!el) {
      setSpot(null);
      setCard({ top: vh / 2, left: vw / 2, placement: "center" });
      return;
    }

    const r = el.getBoundingClientRect();
    // If the target is zero-size or sits fully outside the viewport (couldn't be
    // scrolled into view), fall back to a centered, no-spotlight card rather than
    // rendering an invisible sliver clamped to a viewport edge.
    const offscreen =
      r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw;
    if (offscreen) {
      setSpot(null);
      setCard({ top: vh / 2, left: vw / 2, placement: "center" });
      return;
    }
    // Clamp the spotlight fully inside the viewport so it never lands off-screen
    // (e.g. a wide element inside a horizontally-scrollable drawer).
    const top = Math.max(8, Math.min(r.top - SPOTLIGHT_PADDING, vh - 48));
    const left = Math.max(8, Math.min(r.left - SPOTLIGHT_PADDING, vw - 48));
    const width = Math.max(24, Math.min(r.width + SPOTLIGHT_PADDING * 2, vw - left - 8));
    const height = Math.max(24, Math.min(r.height + SPOTLIGHT_PADDING * 2, vh - top - 8));
    setSpot({ top, left, width, height });

    const cardH = cardRef.current?.offsetHeight ?? 180;
    const belowTop = top + height + CARD_GAP;
    const placement: "below" | "above" = belowTop + cardH < vh ? "below" : "above";
    const cardTop = placement === "below" ? belowTop : Math.max(8, top - cardH - CARD_GAP);
    const cardLeft = Math.min(Math.max(8, left), vw - CARD_WIDTH - 8);
    setCard({ top: cardTop, left: cardLeft, placement });
  }, [step]);

  // On step change: scroll the target into view, then measure.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      // Only scroll (vertically) when the target isn't already in view — and
      // never scroll horizontally (inline: "nearest"), which would shove a
      // horizontally-overflowing drawer sideways.
      const visibleVertically = r.top >= 64 && r.bottom <= window.innerHeight - 64;
      if (!visibleVertically) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
    }
    const raf = window.requestAnimationFrame(measure);
    const t = window.setTimeout(measure, 320); // after smooth scroll settles
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [open, step, measure]);

  // Keep aligned on scroll/resize.
  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, measure]);

  // Body scroll lock + keyboard controls + focus the card.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        setIndex((i) => (i >= total - 1 ? i : i + 1));
        if (index >= total - 1) onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    document.addEventListener("keydown", onKey);
    const focusFrame = window.requestAnimationFrame(() => cardRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [open, onClose, total, index]);

  if (!open || !step || typeof document === "undefined") return null;

  const handleNext = () => {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  };
  const handleBack = () => setIndex((i) => Math.max(0, i - 1));
  const stepLabel = merged.stepOf
    .replace("{current}", String(index + 1))
    .replace("{total}", String(total));

  // Render through a portal to document.body so the overlay is positioned
  // against the real viewport. Rendered inline, a transformed ancestor (e.g. a
  // sliding SideDrawer panel) becomes the containing block for our
  // position:fixed layer, trapping the spotlight + card inside the drawer.
  return createPortal(
    <div className="guided-tour" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
      {spot ? (
        <div
          className="guided-tour__spotlight"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          aria-hidden="true"
        />
      ) : (
        <div className="guided-tour__backdrop" aria-hidden="true" />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className={`guided-tour__card guided-tour__card--${card.placement}`}
        style={
          card.placement === "center"
            ? undefined
            : { top: card.top, left: card.left, width: CARD_WIDTH }
        }
      >
        <p className="guided-tour__step">{stepLabel}</p>
        <h3 className="guided-tour__title" id={titleId}>
          {step.title}
        </h3>
        <p className="guided-tour__body" id={bodyId}>
          {step.body}
        </p>

        <div className="guided-tour__footer">
          <div className="guided-tour__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={`${s.title}-${i}`}
                className={`guided-tour__dot ${i === index ? "guided-tour__dot--active" : ""}`}
              />
            ))}
          </div>
          <div className="guided-tour__actions">
            <button type="button" className="guided-tour__btn guided-tour__btn--ghost" onClick={onClose}>
              {merged.skip}
            </button>
            {index > 0 ? (
              <button type="button" className="guided-tour__btn guided-tour__btn--secondary" onClick={handleBack}>
                {merged.back}
              </button>
            ) : null}
            <button type="button" className="guided-tour__btn guided-tour__btn--primary" onClick={handleNext}>
              {isLast ? merged.done : merged.next}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
