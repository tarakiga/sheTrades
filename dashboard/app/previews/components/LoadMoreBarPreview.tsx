"use client";

import { useState } from "react";
import { LoadMoreBar } from "../../../components/ui";

/**
 * The bar in its three states: more to load, everything loaded, and loading
 * with no known total. The first one is live: each press adds a page, so the
 * count and the button can be seen doing their job.
 */
export function LoadMoreBarPreview() {
  const [loaded, setLoaded] = useState(50);
  const total = 30689;
  return (
    <div className="preview-card-content">
      <LoadMoreBar
        loaded={loaded}
        total={total}
        noun="learner"
        hasMore={loaded < total}
        onLoadMore={() => setLoaded((n) => Math.min(n + 50, total))}
      />
      <LoadMoreBar loaded={25} total={25} noun="reward" hasMore={false} onLoadMore={() => undefined} />
      <LoadMoreBar loaded={50} total={null} noun="learner" hasMore loading onLoadMore={() => undefined} />
    </div>
  );
}
