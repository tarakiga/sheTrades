"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  content?: ReactNode;
};

export type TabsProps = {
  items: Array<TabItem>;
  activeId: string;
  /**
   * Accessible name for the tab list, e.g. "Analytics views" or "Report types".
   * GAP-H3: a screen reader announcing a generic "Tabs" on every tablist gives
   * the user no way to tell one group from another - pass what these tabs are.
   */
  label?: string;
};

export function Tabs({ items, activeId, label }: TabsProps) {
  const [selectedId, setSelectedId] = useState(activeId);
  const instanceId = useId();
  const activeItem = items.find((item) => item.id === selectedId) ?? items[0];
  const getTabId = (id: string) => `${instanceId}-tab-${id}`;
  const getPanelId = (id: string) => `${instanceId}-panel-${id}`;

  return (
    <section className="ui-tabs">
      <div
        className="ui-tabs__list"
        role="tablist"
        aria-label={label ?? "Content sections"}
        suppressHydrationWarning
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ui-tabs__tab ${item.id === activeItem?.id ? "ui-tabs__tab--active" : ""}`}
            role="tab"
            id={getTabId(item.id)}
            aria-selected={item.id === activeItem?.id}
            aria-controls={getPanelId(item.id)}
            onClick={() => setSelectedId(item.id)}
            suppressHydrationWarning
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeItem?.content ? (
        <div
          className="ui-tabs__panel"
          id={getPanelId(activeItem.id)}
          role="tabpanel"
          aria-labelledby={getTabId(activeItem.id)}
          suppressHydrationWarning
        >
          {activeItem.content}
        </div>
      ) : null}
    </section>
  );
}
