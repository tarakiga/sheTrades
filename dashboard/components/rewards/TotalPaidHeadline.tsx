import type { ReactElement } from "react";
import { formatNgn } from "../../lib/format";

export type TotalPaidHeadlineProps = {
  amount: number;
  periodLabel: string;
  deltaVsPreviousPeriod: number | null;
};

const UNICODE_MINUS = "−";

function formatDelta(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${UNICODE_MINUS}${Math.abs(rounded)}%`;
  return "0%";
}

export function TotalPaidHeadline({
  amount,
  periodLabel,
  deltaVsPreviousPeriod
}: TotalPaidHeadlineProps): ReactElement {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const showDelta =
    typeof deltaVsPreviousPeriod === "number" && Number.isFinite(deltaVsPreviousPeriod);
  const deltaIsPositive = showDelta && deltaVsPreviousPeriod >= 0;
  const deltaClass = deltaIsPositive
    ? "total-paid-headline__delta total-paid-headline__delta--positive"
    : "total-paid-headline__delta total-paid-headline__delta--negative";

  return (
    <div className="total-paid-headline">
      <div className="total-paid-headline__row">
        <p className="total-paid-headline__amount">{formatNgn(safeAmount)}</p>
        {showDelta ? (
          <span className={deltaClass}>{formatDelta(deltaVsPreviousPeriod)}</span>
        ) : null}
      </div>
      <p className="total-paid-headline__period">{periodLabel}</p>
    </div>
  );
}
