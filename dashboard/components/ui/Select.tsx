"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = {
  id: string;
  label: string;
  value: string;
  options: Array<SelectOption>;
  placeholder?: string;
  hint?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  onChange: (value: string) => void;
};

export function Select({
  id,
  label,
  value,
  options,
  placeholder = "Select an option",
  hint,
  emptyMessage = "No options available.",
  disabled = false,
  className,
  labelClassName,
  onChange
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const selectedIndex = Math.max(
      options.findIndex((option) => option.value === value),
      0
    );
    setActiveIndex(selectedIndex);

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, options, value]);

  useEffect(() => {
    if (!open || options.length === 0) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open, options.length]);

  function commitSelection(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    window.requestAnimationFrame(() => {
      buttonRef.current?.focus();
    });
  }

  function moveActiveIndex(direction: 1 | -1) {
    if (options.length === 0) {
      return;
    }
    setActiveIndex((current) => {
      const next = current + direction;
      if (next < 0) {
        return options.length - 1;
      }
      if (next >= options.length) {
        return 0;
      }
      return next;
    });
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleOptionKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    option: SelectOption,
    index: number
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveIndex(index);
      commitSelection(option.value);
    }
  }

  const computedClassName = ["ui-select-field", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={computedClassName} ref={rootRef}>
      <label className="ui-select-field__label" htmlFor={id}>
        <span className={labelClassName}>{label}</span>
      </label>
      <div className="ui-select">
        <button
          id={id}
          ref={buttonRef}
          type="button"
          className={`ui-select__trigger ${open ? "ui-select__trigger--open" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
        >
          <span
            className={`ui-select__value ${selectedOption ? "" : "ui-select__value--placeholder"}`}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          <span className="ui-select__chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
              <path
                d="M5.5 7.5L10 12L14.5 7.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        {open ? (
          <div className="ui-select__menu" role="presentation">
            {options.length ? (
              <div className="ui-select__options" role="listbox" id={`${id}-listbox`}>
                {options.map((option, index) => {
                  const selected = option.value === value;

                  return (
                    <button
                      key={option.value}
                      ref={(element) => {
                        optionRefs.current[index] = element;
                      }}
                      type="button"
                      role="option"
                      className={`ui-select__option ${
                        selected ? "ui-select__option--selected" : ""
                      }`}
                      aria-selected={selected}
                      onClick={() => commitSelection(option.value)}
                      onKeyDown={(event) => handleOptionKeyDown(event, option, index)}
                    >
                      <span>{option.label}</span>
                      {selected ? (
                        <span className="ui-select__checkmark" aria-hidden="true">
                          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                            <path
                              d="M5.5 10.5L8.5 13.5L14.5 7.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ui-select__empty">{emptyMessage}</div>
            )}
          </div>
        ) : null}
      </div>
      {hint ? <p className="ui-select-field__hint">{hint}</p> : null}
    </div>
  );
}
