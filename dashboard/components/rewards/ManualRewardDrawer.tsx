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

export type LearnerOption = {
  id: string;
  name: string;
  phone: string;
};

export type ManualRewardDrawerProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    phone: string;
    amount: number;
    channel: string;
    note: string;
  }) => Promise<void>;
  defaultAmount: number;
  defaultChannel: string;
  learners: Array<LearnerOption>;
};

const NOTE_MIN_LENGTH = 10;
const MAX_AUTOCOMPLETE_RESULTS = 8;

type FormErrors = {
  learner?: string;
  amount?: string;
  channel?: string;
  note?: string;
};

type TouchedFields = {
  learner: boolean;
  amount: boolean;
  channel: boolean;
  note: boolean;
};

const TOUCHED_INITIAL: TouchedFields = {
  learner: false,
  amount: false,
  channel: false,
  note: false
};

function maskPhone(phone: string): string {
  if (phone.length < 5) return phone;
  const tail = phone.slice(-4);
  return `••• ${tail}`;
}

export function ManualRewardDrawer(
  props: ManualRewardDrawerProps
): ReactElement | null {
  const {
    open,
    onClose,
    onSubmit,
    defaultAmount,
    defaultChannel,
    learners
  } = props;

  const titleId = useId();
  const learnerInputId = useId();
  const amountInputId = useId();
  const channelInputId = useId();
  const noteInputId = useId();

  const drawerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  const [selectedLearner, setSelectedLearner] =
    useState<LearnerOption | null>(null);
  const [learnerQuery, setLearnerQuery] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [channel, setChannel] = useState<string>(defaultChannel);
  const [note, setNote] = useState<string>("");
  const [touched, setTouched] = useState<TouchedFields>(TOUCHED_INITIAL);
  const [submitAttempted, setSubmitAttempted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset internal state whenever the drawer transitions to closed.
  useEffect(() => {
    if (!open) {
      setSelectedLearner(null);
      setLearnerQuery("");
      setShowSuggestions(false);
      setAmount(String(defaultAmount));
      setChannel(defaultChannel);
      setNote("");
      setTouched(TOUCHED_INITIAL);
      setSubmitAttempted(false);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open, defaultAmount, defaultChannel]);

  // True when the form has any user-entered content beyond defaults.
  const isDirty = useMemo(() => {
    if (selectedLearner !== null) return true;
    if (learnerQuery.trim().length > 0) return true;
    if (amount !== String(defaultAmount)) return true;
    if (channel !== defaultChannel) return true;
    if (note.trim().length > 0) return true;
    return false;
  }, [selectedLearner, learnerQuery, amount, channel, note, defaultAmount, defaultChannel]);

  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  function requestClose() {
    if (submitting) return;
    if (isDirtyRef.current) {
      const confirmed = window.confirm(
        "Discard this draft reward? Your changes will be lost."
      );
      if (!confirmed) return;
    }
    onCloseRef.current();
  }

  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    // Skip body scroll lock and ESC handling when rendered inside the
    // preview workshop frame (drawer is rendered in place, not as an
    // overlay).
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
        requestCloseRef.current();
      }
    }

    if (!isPreviewFrame) {
      document.addEventListener("keydown", handleKeyDown);
    }

    const frame = window.requestAnimationFrame(() => {
      const focusTarget =
        drawerRef.current?.querySelector<HTMLElement>(
          "input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])"
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
  }, [open]);

  const suggestions = useMemo<Array<LearnerOption>>(() => {
    const query = learnerQuery.trim().toLowerCase();
    if (query.length === 0) {
      return [];
    }
    const matches: Array<LearnerOption> = [];
    for (const learner of learners) {
      if (matches.length >= MAX_AUTOCOMPLETE_RESULTS) break;
      const name = learner.name.toLowerCase();
      const phone = learner.phone.toLowerCase();
      if (name.includes(query) || phone.includes(query)) {
        matches.push(learner);
      }
    }
    return matches;
  }, [learnerQuery, learners]);

  const parsedAmount = useMemo(() => {
    const trimmed = amount.trim();
    if (trimmed.length === 0) return Number.NaN;
    const num = Number(trimmed);
    return num;
  }, [amount]);

  const errors = useMemo<FormErrors>(() => {
    const result: FormErrors = {};
    if (selectedLearner === null) {
      result.learner = "Pick a learner to receive this reward.";
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      result.amount = "Amount must be a positive number.";
    }
    if (channel.trim().length === 0) {
      result.channel = "Channel is required (e.g. airtime).";
    }
    if (note.trim().length < NOTE_MIN_LENGTH) {
      result.note = `Add at least ${NOTE_MIN_LENGTH} characters explaining this manual reward.`;
    }
    return result;
  }, [selectedLearner, parsedAmount, channel, note]);

  const hasErrors = Object.keys(errors).length > 0;

  function shouldShowError(field: keyof TouchedFields): boolean {
    return (submitAttempted || touched[field]) && errors[field] !== undefined;
  }

  if (!open) {
    return null;
  }

  function handleLearnerQueryChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setLearnerQuery(value);
    setShowSuggestions(true);
    // Typing implicitly clears any previously selected learner if they
    // no longer match the visible text.
    if (selectedLearner !== null) {
      setSelectedLearner(null);
    }
  }

  function handleLearnerInputBlur() {
    // Defer to allow click handlers on suggestions to fire first.
    window.setTimeout(() => {
      setShowSuggestions(false);
      setTouched((prev) => ({ ...prev, learner: true }));
    }, 120);
  }

  function handleLearnerInputFocus() {
    if (learnerQuery.trim().length > 0 && selectedLearner === null) {
      setShowSuggestions(true);
    }
  }

  function handlePickSuggestion(option: LearnerOption) {
    setSelectedLearner(option);
    setLearnerQuery("");
    setShowSuggestions(false);
    setTouched((prev) => ({ ...prev, learner: true }));
  }

  function handleClearLearner() {
    setSelectedLearner(null);
    setLearnerQuery("");
    setTouched((prev) => ({ ...prev, learner: true }));
  }

  function handleAmountChange(event: ChangeEvent<HTMLInputElement>) {
    setAmount(event.target.value);
  }

  function handleChannelChange(event: ChangeEvent<HTMLInputElement>) {
    setChannel(event.target.value);
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.target.value);
  }

  function markTouched(field: keyof TouchedFields) {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    if (hasErrors || selectedLearner === null) {
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit({
        phone: selectedLearner.phone,
        amount: parsedAmount,
        channel: channel.trim(),
        note: note.trim()
      });
      // Clear local state and dismiss.
      setSelectedLearner(null);
      setLearnerQuery("");
      setAmount(String(defaultAmount));
      setChannel(defaultChannel);
      setNote("");
      setTouched(TOUCHED_INITIAL);
      setSubmitAttempted(false);
      // Force-close without dirty confirmation.
      isDirtyRef.current = false;
      onCloseRef.current();
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Something went wrong while issuing this reward. Try again.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="manual-reward-drawer" aria-hidden={!open}>
      <button
        type="button"
        className="manual-reward-drawer__backdrop"
        aria-label="Close drawer"
        onClick={requestClose}
      />
      <div
        ref={drawerRef}
        className="manual-reward-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="manual-reward-drawer__header">
          <h2 className="manual-reward-drawer__title" id={titleId}>
            Issue Manual Reward
          </h2>
          <button
            type="button"
            className="manual-reward-drawer__close"
            aria-label="Close drawer"
            onClick={requestClose}
          >
            Close
          </button>
        </header>

        <form
          className="manual-reward-drawer__form"
          onSubmit={handleSubmit}
          noValidate
        >
          {submitError ? (
            <div
              className="manual-reward-drawer__alert"
              role="alert"
              aria-live="polite"
            >
              {submitError}
            </div>
          ) : null}

          <div className="manual-reward-drawer__field">
            <label
              className="manual-reward-drawer__field-label"
              htmlFor={learnerInputId}
            >
              Learner <span aria-hidden="true">*</span>
            </label>
            {selectedLearner ? (
              <div className="manual-reward-drawer__selected-learner">
                <div className="manual-reward-drawer__selected-learner-body">
                  <span className="manual-reward-drawer__selected-learner-name">
                    {selectedLearner.name}
                  </span>
                  <span className="manual-reward-drawer__selected-learner-phone">
                    {maskPhone(selectedLearner.phone)}
                  </span>
                </div>
                <button
                  type="button"
                  className="manual-reward-drawer__selected-learner-clear"
                  onClick={handleClearLearner}
                  disabled={submitting}
                >
                  Clear
                </button>
              </div>
            ) : null}
            <div className="manual-reward-drawer__autocomplete">
              <input
                id={learnerInputId}
                className="manual-reward-drawer__input"
                type="text"
                value={learnerQuery}
                onChange={handleLearnerQueryChange}
                onBlur={handleLearnerInputBlur}
                onFocus={handleLearnerInputFocus}
                placeholder={
                  selectedLearner
                    ? "Search again to change learner…"
                    : "Search by name or phone…"
                }
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && suggestions.length > 0}
                aria-describedby={
                  shouldShowError("learner") ? `${learnerInputId}-error` : undefined
                }
                disabled={submitting}
              />
              {showSuggestions && suggestions.length > 0 ? (
                <ul
                  className="manual-reward-drawer__suggestions"
                  role="listbox"
                >
                  {suggestions.map((option) => (
                    <li
                      key={option.id}
                      role="option"
                      aria-selected={false}
                      className="manual-reward-drawer__suggestion"
                    >
                      <button
                        type="button"
                        className="manual-reward-drawer__suggestion-btn"
                        onMouseDown={(event) => {
                          // Prevent input blur from firing before the click
                          // handler — otherwise the suggestion list would
                          // close before the selection registers.
                          event.preventDefault();
                        }}
                        onClick={() => handlePickSuggestion(option)}
                      >
                        <span className="manual-reward-drawer__suggestion-name">
                          {option.name}
                        </span>
                        <span className="manual-reward-drawer__suggestion-phone">
                          {option.phone}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {shouldShowError("learner") ? (
              <span
                className="manual-reward-drawer__field-error"
                id={`${learnerInputId}-error`}
                role="alert"
              >
                {errors.learner}
              </span>
            ) : (
              <span className="manual-reward-drawer__field-hint">
                Type to filter learners by name or phone number.
              </span>
            )}
          </div>

          <div className="manual-reward-drawer__field-row">
            <div className="manual-reward-drawer__field">
              <label
                className="manual-reward-drawer__field-label"
                htmlFor={amountInputId}
              >
                Amount (NGN) <span aria-hidden="true">*</span>
              </label>
              <input
                id={amountInputId}
                className="manual-reward-drawer__input"
                type="number"
                inputMode="decimal"
                min={1}
                step={50}
                value={amount}
                onChange={handleAmountChange}
                onBlur={() => markTouched("amount")}
                disabled={submitting}
                aria-describedby={
                  shouldShowError("amount") ? `${amountInputId}-error` : undefined
                }
              />
              {shouldShowError("amount") ? (
                <span
                  className="manual-reward-drawer__field-error"
                  id={`${amountInputId}-error`}
                  role="alert"
                >
                  {errors.amount}
                </span>
              ) : null}
            </div>

            <div className="manual-reward-drawer__field">
              <label
                className="manual-reward-drawer__field-label"
                htmlFor={channelInputId}
              >
                Channel <span aria-hidden="true">*</span>
              </label>
              <input
                id={channelInputId}
                className="manual-reward-drawer__input"
                type="text"
                value={channel}
                onChange={handleChannelChange}
                onBlur={() => markTouched("channel")}
                placeholder="airtime"
                autoComplete="off"
                disabled={submitting}
                aria-describedby={
                  shouldShowError("channel") ? `${channelInputId}-error` : undefined
                }
              />
              {shouldShowError("channel") ? (
                <span
                  className="manual-reward-drawer__field-error"
                  id={`${channelInputId}-error`}
                  role="alert"
                >
                  {errors.channel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="manual-reward-drawer__field">
            <label
              className="manual-reward-drawer__field-label"
              htmlFor={noteInputId}
            >
              Reason note <span aria-hidden="true">*</span>
            </label>
            <textarea
              id={noteInputId}
              className="manual-reward-drawer__textarea"
              value={note}
              onChange={handleNoteChange}
              onBlur={() => markTouched("note")}
              rows={4}
              placeholder="Why are you issuing this reward manually?"
              disabled={submitting}
              aria-describedby={
                shouldShowError("note") ? `${noteInputId}-error` : undefined
              }
            />
            {shouldShowError("note") ? (
              <span
                className="manual-reward-drawer__field-error"
                id={`${noteInputId}-error`}
                role="alert"
              >
                {errors.note}
              </span>
            ) : (
              <span className="manual-reward-drawer__field-hint">
                At least {NOTE_MIN_LENGTH} characters. Stored in the audit log.
              </span>
            )}
          </div>

          <footer className="manual-reward-drawer__footer">
            <button
              type="button"
              className="manual-reward-drawer__btn manual-reward-drawer__btn--secondary"
              onClick={requestClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="manual-reward-drawer__btn manual-reward-drawer__btn--primary"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <span className="manual-reward-drawer__submit-busy">
                  <span
                    className="manual-reward-drawer__spinner"
                    aria-hidden="true"
                  />
                  Issuing…
                </span>
              ) : (
                "Issue reward"
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
