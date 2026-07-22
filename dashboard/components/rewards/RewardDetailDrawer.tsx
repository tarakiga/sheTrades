"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement
} from "react";
import { formatNgn, formatRelativeTime } from "../../lib/format";
import { maskPhone, type RewardLogRow } from "./RewardsTable";

export type RewardDetailDrawerProps = {
  reward: RewardLogRow | null;
  open: boolean;
  onClose: () => void;
  onRetry: (id: string) => Promise<void>;
  onMarkIssued: (
    id: string,
    note: string,
    providerTxnId?: string
  ) => Promise<void>;
  onOpenLearner: (userId: string) => void;
};

type DrawerMode = "view" | "mark-issued";

const NOTE_MIN_LENGTH = 10;

const STATUS_MODIFIER: Record<RewardLogRow["status"], string> = {
  Issued: "reward-detail-drawer__status-pill--issued",
  Pending: "reward-detail-drawer__status-pill--pending",
  Failed: "reward-detail-drawer__status-pill--failed"
};

type TimelineStep = {
  key: string;
  title: string;
  when: string;
  state: "done" | "current" | "pending";
};

function buildTimeline(reward: RewardLogRow): Array<TimelineStep> {
  const steps: Array<TimelineStep> = [];

  steps.push({
    key: "created",
    title: "Created",
    when: formatRelativeTime(reward.createdAt),
    state: "done"
  });

  const attempts = Math.max(reward.retryCount, 0);
  for (let index = 0; index < attempts; index += 1) {
    steps.push({
      key: `attempt-${index + 1}`,
      title: `Attempt ${index + 1}`,
      when: "-",
      state: "done"
    });
  }

  if (reward.status === "Issued") {
    steps.push({
      key: "issued",
      title: "Issued",
      when: formatRelativeTime(reward.issuedAt),
      state: "done"
    });
  } else if (reward.status === "Failed") {
    steps.push({
      key: "failed",
      title: "Failed",
      when: formatRelativeTime(reward.createdAt),
      state: "current"
    });
  } else {
    steps.push({
      key: "pending",
      title: "Pending dispatch",
      when: "-",
      state: "current"
    });
  }

  return steps;
}

export function RewardDetailDrawer(
  props: RewardDetailDrawerProps
): ReactElement | null {
  const { reward, open, onClose, onRetry, onMarkIssued, onOpenLearner } = props;
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  const [mode, setMode] = useState<DrawerMode>("view");
  const [note, setNote] = useState<string>("");
  const [providerTxnId, setProviderTxnId] = useState<string>("");
  const [retrying, setRetrying] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset form whenever the underlying reward identity changes or the
  // drawer is dismissed.
  useEffect(() => {
    setMode("view");
    setNote("");
    setProviderTxnId("");
    setNoteError(null);
  }, [reward?.id, open]);

  useEffect(() => {
    if (!open || !reward) {
      return;
    }
    // Skip body scroll lock and ESC handling when the drawer is rendered
    // inside the preview workshop frame (which simulates the drawer in
    // place rather than as a true page-level overlay).
    const isPreviewFrame = drawerRef.current?.closest(
      ".preview-drawer-frame"
    );
    const previousOverflow = document.body.style.overflow;
    if (!isPreviewFrame) {
      document.body.style.overflow = "hidden";
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    if (!isPreviewFrame) {
      document.addEventListener("keydown", handleKeyDown);
    }

    const frame = window.requestAnimationFrame(() => {
      const focusTarget =
        drawerRef.current?.querySelector<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        ) ?? drawerRef.current;
      if (!isPreviewFrame) {
        focusTarget?.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (!isPreviewFrame) {
        document.body.style.overflow = previousOverflow;
        document.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [open, reward]);

  const timeline = useMemo(
    () => (reward ? buildTimeline(reward) : []),
    [reward]
  );

  if (!reward) {
    return null;
  }

  if (!open) {
    return null;
  }

  const statusClass = [
    "reward-detail-drawer__status-pill",
    STATUS_MODIFIER[reward.status]
  ].join(" ");

  const showRetry = reward.status === "Pending" || reward.status === "Failed";
  const showMarkIssued = reward.status === "Pending";

  async function handleRetry() {
    if (!reward || retrying) return;
    try {
      setRetrying(true);
      await onRetry(reward.id);
    } finally {
      setRetrying(false);
    }
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.target.value);
    if (noteError) setNoteError(null);
  }

  function handleProviderTxnIdChange(event: ChangeEvent<HTMLInputElement>) {
    setProviderTxnId(event.target.value);
  }

  async function handleMarkIssuedSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reward) return;
    const trimmedNote = note.trim();
    if (trimmedNote.length < NOTE_MIN_LENGTH) {
      setNoteError(
        `Add at least ${NOTE_MIN_LENGTH} characters explaining the manual issue.`
      );
      return;
    }
    const trimmedTxn = providerTxnId.trim();
    try {
      setSubmitting(true);
      await onMarkIssued(
        reward.id,
        trimmedNote,
        trimmedTxn.length > 0 ? trimmedTxn : undefined
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="reward-detail-drawer" aria-hidden={!open}>
      <button
        type="button"
        className="reward-detail-drawer__backdrop"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className="reward-detail-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="reward-detail-drawer__header">
          <div className="reward-detail-drawer__heading">
            <h2 className="reward-detail-drawer__title" id={titleId}>
              Reward detail
            </h2>
            <span className={statusClass}>{reward.status}</span>
          </div>
          <button
            type="button"
            className="reward-detail-drawer__close"
            aria-label="Close drawer"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="reward-detail-drawer__content">
          <section
            className="reward-detail-drawer__section reward-detail-drawer__identity"
            aria-label="Identity"
          >
            <div className="reward-detail-drawer__identity-row">
              <span className="reward-detail-drawer__label">Learner</span>
              <span className="reward-detail-drawer__value">{reward.learner}</span>
            </div>
            <div className="reward-detail-drawer__identity-row">
              <span className="reward-detail-drawer__label">Phone</span>
              <span className="reward-detail-drawer__value">
                {maskPhone(reward.learnerPhone)}
              </span>
            </div>
            <div className="reward-detail-drawer__identity-row">
              <span className="reward-detail-drawer__label">Module</span>
              <span className="reward-detail-drawer__value">{reward.module}</span>
            </div>
            <div className="reward-detail-drawer__identity-row">
              <span className="reward-detail-drawer__label">Amount</span>
              <span className="reward-detail-drawer__value reward-detail-drawer__value--amount">
                {formatNgn(reward.amount)}
              </span>
            </div>
            <div className="reward-detail-drawer__identity-row">
              <span className="reward-detail-drawer__label">Channel</span>
              <span className="reward-detail-drawer__value">{reward.channel}</span>
            </div>
          </section>

          <section
            className="reward-detail-drawer__section"
            aria-label="Issuance timeline"
          >
            <h3 className="reward-detail-drawer__section-title">
              Issuance timeline
            </h3>
            <ol className="reward-detail-drawer__timeline">
              {timeline.map((step) => (
                <li
                  key={step.key}
                  className={`reward-detail-drawer__timeline-item reward-detail-drawer__timeline-item--${step.state}`}
                >
                  <span
                    className="reward-detail-drawer__timeline-dot"
                    aria-hidden="true"
                  />
                  <div className="reward-detail-drawer__timeline-body">
                    <span className="reward-detail-drawer__timeline-title">
                      {step.title}
                    </span>
                    <span className="reward-detail-drawer__timeline-when">
                      {step.when}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {(reward.providerTxnId ||
            reward.failureReason ||
            reward.noteFromActor) && (
            <section
              className="reward-detail-drawer__section"
              aria-label="Provider details"
            >
              <h3 className="reward-detail-drawer__section-title">
                Provider details
              </h3>
              <dl className="reward-detail-drawer__details">
                {reward.providerTxnId ? (
                  <div className="reward-detail-drawer__details-row">
                    <dt className="reward-detail-drawer__label">
                      Provider txn id
                    </dt>
                    <dd className="reward-detail-drawer__value reward-detail-drawer__value--mono">
                      {reward.providerTxnId}
                    </dd>
                  </div>
                ) : null}
                {reward.failureReason ? (
                  <div className="reward-detail-drawer__details-row">
                    <dt className="reward-detail-drawer__label">
                      Failure reason
                    </dt>
                    <dd className="reward-detail-drawer__value reward-detail-drawer__value--failure">
                      {reward.failureReason}
                    </dd>
                  </div>
                ) : null}
                {reward.noteFromActor ? (
                  <div className="reward-detail-drawer__details-row">
                    <dt className="reward-detail-drawer__label">Actor note</dt>
                    <dd className="reward-detail-drawer__value">
                      {reward.noteFromActor}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          )}

          {mode === "mark-issued" ? (
            <form
              className="reward-detail-drawer__section reward-detail-drawer__form"
              onSubmit={handleMarkIssuedSubmit}
              aria-label="Mark reward as issued"
            >
              <h3 className="reward-detail-drawer__section-title">
                Mark issued manually
              </h3>
              <label className="reward-detail-drawer__field">
                <span className="reward-detail-drawer__field-label">
                  Note <span aria-hidden="true">*</span>
                </span>
                <textarea
                  className="reward-detail-drawer__textarea"
                  value={note}
                  onChange={handleNoteChange}
                  rows={4}
                  required
                  minLength={NOTE_MIN_LENGTH}
                  placeholder="Why is this being marked issued outside the provider?"
                />
                {noteError ? (
                  <span className="reward-detail-drawer__field-error" role="alert">
                    {noteError}
                  </span>
                ) : (
                  <span className="reward-detail-drawer__field-hint">
                    At least {NOTE_MIN_LENGTH} characters. Stored in the audit
                    log.
                  </span>
                )}
              </label>
              <label className="reward-detail-drawer__field">
                <span className="reward-detail-drawer__field-label">
                  Provider txn id (optional)
                </span>
                <input
                  className="reward-detail-drawer__input"
                  type="text"
                  value={providerTxnId}
                  onChange={handleProviderTxnIdChange}
                  placeholder="e.g. RLY-1234567890"
                  autoComplete="off"
                />
              </label>
              <div className="reward-detail-drawer__form-actions">
                <button
                  type="button"
                  className="reward-detail-drawer__btn reward-detail-drawer__btn--secondary"
                  onClick={() => setMode("view")}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="reward-detail-drawer__btn reward-detail-drawer__btn--primary"
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? "Saving…" : "Confirm mark issued"}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <footer className="reward-detail-drawer__footer">
          <button
            type="button"
            className="reward-detail-drawer__btn reward-detail-drawer__btn--link"
            onClick={() => onOpenLearner(reward.id)}
          >
            Open learner →
          </button>
          <div className="reward-detail-drawer__footer-actions">
            {showRetry ? (
              <button
                type="button"
                className="reward-detail-drawer__btn reward-detail-drawer__btn--secondary"
                onClick={handleRetry}
                disabled={retrying || mode === "mark-issued"}
                aria-busy={retrying}
              >
                {retrying ? "Retrying…" : "Retry now"}
              </button>
            ) : null}
            {showMarkIssued && mode === "view" ? (
              <button
                type="button"
                className="reward-detail-drawer__btn reward-detail-drawer__btn--primary"
                onClick={() => setMode("mark-issued")}
              >
                Mark Issued
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
