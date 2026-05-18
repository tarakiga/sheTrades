"use client";

type FilterChipItem = {
  id: string;
  label: string;
  count?: number;
};

export type FilterChipGroupProps = {
  items: Array<FilterChipItem>;
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
};

export function FilterChipGroup({ items, activeId, onChange, ariaLabel }: FilterChipGroupProps) {
  return (
    <div
      className="ui-filter-chip-group"
      role="toolbar"
      aria-label={ariaLabel}
      suppressHydrationWarning
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            className={`ui-filter-chip ${isActive ? "ui-filter-chip--active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onChange(item.id)}
            suppressHydrationWarning
          >
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <span className="ui-filter-chip__count">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
