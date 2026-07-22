"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement
} from "react";
import { getLearnerDetail } from "../../lib/admin/api";
import { formatNgn, formatRelativeTime } from "../../lib/format";
import type { LearnerDetail } from "../../lib/admin/contracts";
import { Badge } from "../ui";

export type LearnerDetailDrawerProps = {
  phone: string | null; // null → closed
  open: boolean;
  onClose: () => void;
  onFlagChange: (
    phone: string,
    flagged: boolean,
    note?: string
  ) => Promise<void>;
};

type DrawerState =
  | { loading: true; detail: null; error: null }
  | { loading: false; detail: LearnerDetail; error: null }
  | { loading: false; detail: null; error: string };

const INITIAL_STATE: DrawerState = {
  loading: true,
  detail: null,
  error: null
};

export function LearnerDetailDrawer(
  props: LearnerDetailDrawerProps
): ReactElement | null {
  const { phone, open, onClose, onFlagChange } = props;
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  const [drawerState, setDrawerState] = useState<DrawerState>(INITIAL_STATE);
  const [flagging, setFlagging] = useState(false);
  const [localFlagged, setLocalFlagged] = useState<boolean | null>(null);
  const [noteValue, setNoteValue] = useState<string>("");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset on identity or open state change
  useEffect(() => {
    setDrawerState(INITIAL_STATE);
    setLocalFlagged(null);
    setNoteValue("");
  }, [phone, open]);

  // Fetch learner detail when drawer opens with a phone
  useEffect(() => {
    if (!open || !phone) return;

    let cancelled = false;

    async function load() {
      if (!phone) return;
      setDrawerState({ loading: true, detail: null, error: null });
      try {
        const result = await getLearnerDetail(phone);
        if (cancelled) return;
        if (!result.data) {
          setDrawerState({
            loading: false,
            detail: null,
            error: "Learner not found."
          });
        } else {
          setDrawerState({ loading: false, detail: result.data, error: null });
          setLocalFlagged(result.data.identity.flaggedForFollowUp);
          setNoteValue(result.data.identity.followUpNote ?? "");
        }
      } catch {
        if (cancelled) return;
        setDrawerState({
          loading: false,
          detail: null,
          error: "Could not load learner details."
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, phone]);

  // ESC to close + body scroll lock
  useEffect(() => {
    if (!open || !phone) return;

    const isPreviewFrame = drawerRef.current?.closest(".preview-drawer-frame");
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
  }, [open, phone]);

  if (!open || !phone) {
    return null;
  }

  const currentFlagged =
    localFlagged ?? drawerState.detail?.identity.flaggedForFollowUp ?? false;

  async function handleFlagToggle() {
    if (!phone || flagging) return;
    const newFlagged = !currentFlagged;
    setLocalFlagged(newFlagged);
    try {
      setFlagging(true);
      await onFlagChange(phone, newFlagged, noteValue.trim() || undefined);
    } finally {
      setFlagging(false);
    }
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNoteValue(event.target.value);
  }

  return (
    <div className="learner-detail-drawer" aria-hidden={!open}>
      <button
        type="button"
        className="learner-detail-drawer__backdrop"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className="learner-detail-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="learner-detail-drawer__header">
          <div className="learner-detail-drawer__heading">
            <h2 className="learner-detail-drawer__title" id={titleId}>
              Learner detail
            </h2>
          </div>
          <button
            type="button"
            className="learner-detail-drawer__close"
            aria-label="Close drawer"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="learner-detail-drawer__content">
          {drawerState.loading ? (
            <p className="learner-detail-drawer__placeholder">
              Loading learner…
            </p>
          ) : drawerState.error !== null ? (
            <p className="learner-detail-drawer__placeholder learner-detail-drawer__placeholder--error">
              {drawerState.error}
            </p>
          ) : (
            <LearnerDetailBody
              detail={drawerState.detail}
              currentFlagged={currentFlagged}
              noteValue={noteValue}
              flagging={flagging}
              onFlagToggle={handleFlagToggle}
              onNoteChange={handleNoteChange}
            />
          )}
        </div>

        <footer className="learner-detail-drawer__footer">
          <button
            type="button"
            className="learner-detail-drawer__btn learner-detail-drawer__btn--secondary"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

type LearnerDetailBodyProps = {
  detail: LearnerDetail;
  currentFlagged: boolean;
  noteValue: string;
  flagging: boolean;
  onFlagToggle: () => void;
  onNoteChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
};

function LearnerDetailBody(props: LearnerDetailBodyProps): ReactElement {
  const { detail, currentFlagged, noteValue, flagging, onFlagToggle, onNoteChange } =
    props;
  const { identity, session, progress, quizAttempts, rewards } = detail;

  return (
    <>
      {/* Identity */}
      <section
        className="learner-detail-drawer__section learner-detail-drawer__identity"
        aria-label="Identity"
      >
        <div className="learner-detail-drawer__identity-row">
          <span className="learner-detail-drawer__label">Name</span>
          <span className="learner-detail-drawer__value">
            {identity.name ?? "-"}
          </span>
        </div>
        <div className="learner-detail-drawer__identity-row">
          <span className="learner-detail-drawer__label">Phone</span>
          <span className="learner-detail-drawer__value">{identity.phone}</span>
        </div>
        <div className="learner-detail-drawer__identity-row">
          <span className="learner-detail-drawer__label">Location</span>
          <span className="learner-detail-drawer__value">
            {identity.location ?? "-"}
          </span>
        </div>
        <div className="learner-detail-drawer__identity-row">
          <span className="learner-detail-drawer__label">Language</span>
          <span className="learner-detail-drawer__value">
            {identity.language ?? "-"}
          </span>
        </div>
        <div className="learner-detail-drawer__identity-row">
          <span className="learner-detail-drawer__label">Status</span>
          <span className="learner-detail-drawer__value">
            <Badge
              variant={identity.status === "Active" ? "success" : "warning"}
            >
              {identity.status}
            </Badge>
          </span>
        </div>
        <div className="learner-detail-drawer__identity-row">
          <span className="learner-detail-drawer__label">Member since</span>
          <span className="learner-detail-drawer__value">
            {formatRelativeTime(identity.createdAt)}
          </span>
        </div>
      </section>

      {/* Follow-up */}
      <section
        className="learner-detail-drawer__section learner-detail-drawer__followup"
        aria-label="Follow-up"
      >
        <h3 className="learner-detail-drawer__section-title">Follow-up</h3>
        <div className="learner-detail-drawer__followup-row">
          <button
            type="button"
            className={[
              "learner-detail-drawer__btn",
              currentFlagged
                ? "learner-detail-drawer__btn--primary"
                : "learner-detail-drawer__btn--secondary"
            ].join(" ")}
            onClick={onFlagToggle}
            disabled={flagging}
            aria-busy={flagging}
          >
            {flagging
              ? "Saving…"
              : currentFlagged
                ? "Flagged ✓"
                : "Flag for follow-up"}
          </button>
        </div>
        <label className="learner-detail-drawer__field">
          <span className="learner-detail-drawer__field-label">Note</span>
          <textarea
            className="learner-detail-drawer__textarea"
            value={noteValue}
            onChange={onNoteChange}
            rows={3}
            placeholder="Add a follow-up note…"
          />
        </label>
      </section>

      {/* Session */}
      <section
        className="learner-detail-drawer__section"
        aria-label="Session"
      >
        <h3 className="learner-detail-drawer__section-title">Session</h3>
        {session ? (
          <dl className="learner-detail-drawer__details">
            <div className="learner-detail-drawer__details-row">
              <dt className="learner-detail-drawer__label">State</dt>
              <dd className="learner-detail-drawer__value">
                {session.state ?? "-"}
              </dd>
            </div>
            <div className="learner-detail-drawer__details-row">
              <dt className="learner-detail-drawer__label">
                Current lesson
              </dt>
              <dd className="learner-detail-drawer__value">
                {session.currentLessonKey ?? "-"}
              </dd>
            </div>
            <div className="learner-detail-drawer__details-row">
              <dt className="learner-detail-drawer__label">
                Completed lessons
              </dt>
              <dd className="learner-detail-drawer__value">
                {session.completedLessons.length}
              </dd>
            </div>
            <div className="learner-detail-drawer__details-row">
              <dt className="learner-detail-drawer__label">Last active</dt>
              <dd className="learner-detail-drawer__value">
                {formatRelativeTime(session.lastUpdatedAt)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="learner-detail-drawer__empty">No active session.</p>
        )}
      </section>

      {/* Progress */}
      <section
        className="learner-detail-drawer__section"
        aria-label="Module progress"
      >
        <h3 className="learner-detail-drawer__section-title">
          Module progress
        </h3>
        {progress.length === 0 ? (
          <p className="learner-detail-drawer__empty">
            No module progress yet.
          </p>
        ) : (
          <ul className="learner-detail-drawer__list">
            {progress.map((item) => (
              <li
                key={item.module}
                className="learner-detail-drawer__list-item"
              >
                <span className="learner-detail-drawer__list-item-label">
                  {item.module}
                </span>
                <span className="learner-detail-drawer__list-item-value">
                  {item.completionPercentage}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quiz attempts */}
      <section
        className="learner-detail-drawer__section"
        aria-label="Quiz attempts"
      >
        <h3 className="learner-detail-drawer__section-title">
          Quiz attempts
        </h3>
        {quizAttempts.length === 0 ? (
          <p className="learner-detail-drawer__empty">
            No quiz attempts yet.
          </p>
        ) : (
          <ul className="learner-detail-drawer__list">
            {quizAttempts.map((attempt) => (
              <li
                key={attempt.lessonKey}
                className="learner-detail-drawer__list-item"
              >
                <span className="learner-detail-drawer__list-item-label">
                  {attempt.lessonKey}
                </span>
                <span className="learner-detail-drawer__list-item-meta">
                  <Badge variant={attempt.passed ? "success" : "neutral"}>
                    {attempt.passed ? "Passed" : "Failed"}
                  </Badge>
                  <span className="learner-detail-drawer__attempt-count">
                    {attempt.attemptCount} attempt
                    {attempt.attemptCount !== 1 ? "s" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rewards */}
      <section
        className="learner-detail-drawer__section"
        aria-label="Rewards"
      >
        <h3 className="learner-detail-drawer__section-title">Rewards</h3>
        {rewards.length === 0 ? (
          <p className="learner-detail-drawer__empty">No rewards yet.</p>
        ) : (
          <ul className="learner-detail-drawer__list">
            {rewards.map((reward) => (
              <li
                key={reward.id}
                className="learner-detail-drawer__list-item"
              >
                <span className="learner-detail-drawer__list-item-label">
                  {reward.module}
                </span>
                <span className="learner-detail-drawer__list-item-meta">
                  <span className="learner-detail-drawer__reward-amount">
                    {formatNgn(reward.amount)}
                  </span>
                  <Badge
                    variant={
                      reward.status === "Issued"
                        ? "success"
                        : reward.status === "Failed"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {reward.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
