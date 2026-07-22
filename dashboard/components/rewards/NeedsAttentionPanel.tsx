import type { ReactElement } from "react";
import { formatRelativeTime } from "../../lib/format";

export type NeedsAttentionSeverity = "info" | "warn" | "err";

export type NeedsAttentionItem = {
  severity: NeedsAttentionSeverity;
  title: string;
  meta: string;
  onClick?: () => void;
};

export type NeedsAttentionPanelProps = {
  items: Array<NeedsAttentionItem>;
  lastIssuedAt?: Date;
};

const DOT_CLASS: Record<NeedsAttentionSeverity, string> = {
  info: "needs-attention-panel__dot needs-attention-panel__dot--info",
  warn: "needs-attention-panel__dot needs-attention-panel__dot--warn",
  err: "needs-attention-panel__dot needs-attention-panel__dot--err"
};

function ItemRow({ item }: { item: NeedsAttentionItem }): ReactElement {
  const inner = (
    <>
      <span aria-hidden="true" className={DOT_CLASS[item.severity]} />
      <span className="needs-attention-panel__body">
        <span className="needs-attention-panel__item-title">{item.title}</span>
        <span className="needs-attention-panel__item-meta">{item.meta}</span>
      </span>
    </>
  );

  if (item.onClick) {
    return (
      <button
        className="needs-attention-panel__item"
        onClick={item.onClick}
        type="button"
      >
        {inner}
      </button>
    );
  }

  return <div className="needs-attention-panel__item">{inner}</div>;
}

export function NeedsAttentionPanel({
  items,
  lastIssuedAt
}: NeedsAttentionPanelProps): ReactElement {
  const visibleItems = items.slice(0, 3);

  if (visibleItems.length === 0) {
    const emptyMessage = lastIssuedAt
      ? `All caught up - last issuance ${formatRelativeTime(lastIssuedAt)}`
      : "No issues to report.";
    return (
      <div className="needs-attention-panel">
        <p className="needs-attention-panel__title">Needs attention</p>
        <div className="needs-attention-panel__empty">
          <span aria-hidden="true" className="needs-attention-panel__empty-icon">
            ✓
          </span>
          <span>{emptyMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="needs-attention-panel">
      <p className="needs-attention-panel__title">Needs attention</p>
      <ul className="needs-attention-panel__list">
        {visibleItems.map((item, index) => (
          <li key={`${item.title}-${index}`}>
            <ItemRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
