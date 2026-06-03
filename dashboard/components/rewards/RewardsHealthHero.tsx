import type { ReactElement } from "react";
import Link from "next/link";
import { IssuanceSuccessGauge } from "./IssuanceSuccessGauge";
import { TotalPaidHeadline } from "./TotalPaidHeadline";
import {
  NeedsAttentionPanel,
  type NeedsAttentionItem
} from "./NeedsAttentionPanel";

export type RewardsHealthHeroProps = {
  providerActive: boolean;
  issued: number;
  pending: number;
  failed: number;
  totalPaidAmount: number;
  totalPaidPeriodLabel: string;
  deltaVsPreviousPeriod: number | null;
  attentionItems: Array<NeedsAttentionItem>;
  lastIssuedAt?: Date;
};

const PROVIDER_SETUP_HREF = "/settings?tab=integration";

const BANNER_COPY =
  "Pending rewards will not dispatch until a payouts provider is configured.";

export function RewardsHealthHero(props: RewardsHealthHeroProps): ReactElement {
  if (!props.providerActive) {
    return (
      <div
        className="rewards-health-hero__banner"
        role="status"
      >
        <p className="rewards-health-hero__banner-message">{BANNER_COPY}</p>
        <Link
          className="rewards-health-hero__banner-link"
          href={PROVIDER_SETUP_HREF}
        >
          Set up provider →
        </Link>
      </div>
    );
  }

  const needsAttentionProps: {
    items: Array<NeedsAttentionItem>;
    lastIssuedAt?: Date;
  } = props.lastIssuedAt
    ? { items: props.attentionItems, lastIssuedAt: props.lastIssuedAt }
    : { items: props.attentionItems };

  return (
    <div className="rewards-health-hero">
      <div className="rewards-health-hero__cell">
        <IssuanceSuccessGauge
          issued={props.issued}
          pending={props.pending}
          failed={props.failed}
        />
      </div>
      <div className="rewards-health-hero__cell">
        <TotalPaidHeadline
          amount={props.totalPaidAmount}
          periodLabel={props.totalPaidPeriodLabel}
          deltaVsPreviousPeriod={props.deltaVsPreviousPeriod}
        />
      </div>
      <div className="rewards-health-hero__cell">
        <NeedsAttentionPanel {...needsAttentionProps} />
      </div>
    </div>
  );
}
