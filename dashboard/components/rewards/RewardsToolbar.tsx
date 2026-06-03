"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactElement
} from "react";

export type RewardsToolbarStatus = "All" | "Issued" | "Pending" | "Failed";

export type RewardsToolbarDateRange = "24h" | "7d" | "30d" | "custom";

export type RewardsToolbarProps = {
  status: RewardsToolbarStatus;
  onStatusChange: (next: RewardsToolbarStatus) => void;
  dateRange: RewardsToolbarDateRange;
  onDateRangeChange: (next: RewardsToolbarDateRange) => void;
  query: string;
  onQueryChange: (next: string) => void;
  onExportClick: () => void;
  exporting?: boolean;
};

type StatusPill = {
  value: RewardsToolbarStatus;
  label: string;
  modifier: string;
};

type DateRangeOption = {
  value: RewardsToolbarDateRange;
  label: string;
};

const STATUS_PILLS: ReadonlyArray<StatusPill> = [
  { value: "All", label: "All", modifier: "rewards-toolbar__pill--all" },
  { value: "Issued", label: "Issued", modifier: "rewards-toolbar__pill--issued" },
  { value: "Pending", label: "Pending", modifier: "rewards-toolbar__pill--pending" },
  { value: "Failed", label: "Failed", modifier: "rewards-toolbar__pill--failed" }
];

const DATE_RANGE_OPTIONS: ReadonlyArray<DateRangeOption> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom…" }
];

const SEARCH_DEBOUNCE_MS = 300;

export function RewardsToolbar(props: RewardsToolbarProps): ReactElement {
  const exporting = props.exporting === true;
  const [searchDraft, setSearchDraft] = useState<string>(props.query);

  // Sync local draft when the upstream query value is reset externally
  // (e.g., parent clears the filter). We compare against the debounced
  // value to avoid clobbering keystrokes mid-typing.
  useEffect(() => {
    setSearchDraft(props.query);
    // We intentionally only react to changes in the upstream query value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.query]);

  useEffect(() => {
    if (searchDraft === props.query) {
      return;
    }
    const handle = window.setTimeout(() => {
      props.onQueryChange(searchDraft);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [searchDraft, props]);

  function handleStatusClick(next: RewardsToolbarStatus) {
    if (next === props.status) return;
    props.onStatusChange(next);
  }

  function handleDateRangeChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as RewardsToolbarDateRange;
    if (next === props.dateRange) return;
    props.onDateRangeChange(next);
  }

  function handleSearchInput(event: ChangeEvent<HTMLInputElement>) {
    setSearchDraft(event.target.value);
  }

  function handleExportClick() {
    if (exporting) return;
    props.onExportClick();
  }

  return (
    <div className="rewards-toolbar" role="search" aria-label="Filter rewards">
      <div
        className="rewards-toolbar__status-pills"
        role="group"
        aria-label="Filter by status"
      >
        {STATUS_PILLS.map((pill) => {
          const isActive = pill.value === props.status;
          const className = [
            "rewards-toolbar__pill",
            pill.modifier,
            isActive ? "rewards-toolbar__pill--active" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={pill.value}
              type="button"
              className={className}
              aria-pressed={isActive}
              onClick={() => handleStatusClick(pill.value)}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      <div className="rewards-toolbar__date-range">
        <label
          className="rewards-toolbar__date-range-label"
          htmlFor="rewards-toolbar-date-range"
        >
          Range
        </label>
        <select
          id="rewards-toolbar-date-range"
          className="rewards-toolbar__date-range-select"
          value={props.dateRange}
          onChange={handleDateRangeChange}
        >
          {DATE_RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rewards-toolbar__search">
        <label className="rewards-toolbar__sr-only" htmlFor="rewards-toolbar-search">
          Search rewards
        </label>
        <input
          id="rewards-toolbar-search"
          type="search"
          className="rewards-toolbar__search-input"
          placeholder="Search by learner, phone, or reward ID"
          value={searchDraft}
          onChange={handleSearchInput}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <button
        type="button"
        className="rewards-toolbar__export"
        onClick={handleExportClick}
        disabled={exporting}
        aria-busy={exporting}
      >
        {exporting ? (
          <span className="rewards-toolbar__spinner" aria-hidden="true" />
        ) : null}
        <span>{exporting ? "Exporting…" : "Export CSV"}</span>
      </button>
    </div>
  );
}
