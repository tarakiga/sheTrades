import type { ReactElement } from "react";
import { Button } from "./Button";

export type LoadMoreBarProps = {
  /** Rows currently shown in the table above. */
  loaded: number;
  /** Rows matching in all, when the API reports it; null when it does not. */
  total: number | null;
  /** Singular noun for a row, e.g. "learner" or "reward". */
  noun: string;
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
};

/**
 * The footer of a paged table: how much of the whole is on screen, and the
 * way to get more. Every paged list in the console uses this, so "Showing 50
 * of 30,689 learners" reads the same everywhere and a table can never again
 * look complete when it is not.
 */
export function LoadMoreBar({
  loaded,
  total,
  noun,
  hasMore,
  loading = false,
  onLoadMore
}: LoadMoreBarProps): ReactElement {
  const plural = (n: number) => (n === 1 ? noun : `${noun}s`);
  const summary =
    total === null
      ? `Showing ${loaded.toLocaleString()} ${plural(loaded)}`
      : `Showing ${loaded.toLocaleString()} of ${total.toLocaleString()} ${plural(total)}`;

  return (
    <div className="ui-load-more" role="status" aria-live="polite">
      <span className="ui-load-more__summary">{summary}</span>
      {hasMore ? (
        <Button variant="secondary" onClick={onLoadMore} loading={loading} disabled={loading}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
