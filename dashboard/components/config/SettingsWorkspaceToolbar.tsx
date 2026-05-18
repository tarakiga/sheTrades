"use client";

import { Button, FilterChipGroup, Input } from "../ui";

type ToolbarFilter = {
  id: string;
  label: string;
  count?: number;
};

export type SettingsWorkspaceToolbarProps = {
  actionLabel: string;
  actionHint: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: Array<ToolbarFilter>;
  activeFilter: string;
  onFilterChange: (id: string) => void;
  filterAriaLabel: string;
};

export function SettingsWorkspaceToolbar({
  actionLabel,
  actionHint,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  activeFilter,
  onFilterChange,
  filterAriaLabel
}: SettingsWorkspaceToolbarProps) {
  return (
    <section className="settings-workspace-toolbar">
      <div className="settings-workspace-toolbar__primary">
        <div className="settings-workspace-toolbar__action-row">
          <Button onClick={onAction}>{actionLabel}</Button>
          {secondaryActionLabel && onSecondaryAction ? (
            <Button variant="secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          ) : null}
        </div>
        <p className="settings-workspace-toolbar__hint">{actionHint}</p>
      </div>
      <div className="settings-workspace-toolbar__search">
        <Input
          id="settings-workspace-search"
          label={searchLabel}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>
      <FilterChipGroup
        items={filters}
        activeId={activeFilter}
        onChange={onFilterChange}
        ariaLabel={filterAriaLabel}
      />
    </section>
  );
}
