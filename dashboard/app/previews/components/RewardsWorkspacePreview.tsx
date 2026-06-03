import { Card, SectionHeader } from "../../../components/ui";
import { IssuanceSuccessGauge } from "../../../components/rewards/IssuanceSuccessGauge";
import { TotalPaidHeadline } from "../../../components/rewards/TotalPaidHeadline";
import {
  NeedsAttentionPanel,
  type NeedsAttentionItem
} from "../../../components/rewards/NeedsAttentionPanel";
import { RewardsHealthHero } from "../../../components/rewards/RewardsHealthHero";

const STABLE_NOW = new Date("2026-05-18T12:00:00.000Z");
const RECENT_ISSUANCE = new Date(STABLE_NOW.getTime() - 5 * 60 * 1000);

const populatedAttention: Array<NeedsAttentionItem> = [
  {
    severity: "err",
    title: "3 failed dispatches",
    meta: "Reloadly returned INSUFFICIENT_FUNDS · 12:43 UTC"
  },
  {
    severity: "warn",
    title: "12 retries scheduled",
    meta: "Backoff window ends in 8 min"
  },
  {
    severity: "info",
    title: "Manual review pending",
    meta: "2 issuances awaiting ops sign-off"
  }
];

const overflowAttention: Array<NeedsAttentionItem> = [
  ...populatedAttention,
  {
    severity: "warn",
    title: "Stale provider credentials",
    meta: "Termii key rotates in 2 d"
  }
];

export function RewardsWorkspacePreview() {
  return (
    <div className="preview-card-content">
      <SectionHeader
        title="Rewards Workspace"
        description="Top-of-page health hero pieces in loading, empty, and populated states for design review."
      />

      <Card
        title="Issuance Success Gauge"
        description="SVG donut with proportional issued / pending / failed arcs and centred percentage."
      >
        <div className="preview-row">
          <IssuanceSuccessGauge issued={0} pending={0} failed={0} />
          <IssuanceSuccessGauge issued={188} pending={0} failed={0} />
          <IssuanceSuccessGauge issued={94} pending={4} failed={2} />
          <IssuanceSuccessGauge issued={42} pending={18} failed={12} />
        </div>
      </Card>

      <Card
        title="Total Paid Headline"
        description="Period total with delta chip. Chip hides when delta is null."
      >
        <div className="preview-card-content">
          <TotalPaidHeadline
            amount={0}
            periodLabel="No payouts yet this period"
            deltaVsPreviousPeriod={null}
          />
          <TotalPaidHeadline
            amount={478500}
            periodLabel="This week · May 11 — May 18"
            deltaVsPreviousPeriod={12}
          />
          <TotalPaidHeadline
            amount={312000}
            periodLabel="This week · May 11 — May 18"
            deltaVsPreviousPeriod={-4}
          />
          <TotalPaidHeadline
            amount={1240000}
            periodLabel="This month · May 2026"
            deltaVsPreviousPeriod={null}
          />
        </div>
      </Card>

      <Card
        title="Needs Attention Panel"
        description="Up to 3 escalation rows, or an all-caught-up empty state."
      >
        <div className="preview-card-content">
          <NeedsAttentionPanel items={[]} lastIssuedAt={RECENT_ISSUANCE} />
          <NeedsAttentionPanel items={[]} />
          <NeedsAttentionPanel items={populatedAttention} />
          <NeedsAttentionPanel items={overflowAttention} />
        </div>
      </Card>

      <Card
        title="Rewards Health Hero — populated"
        description="3-column hero when a payouts provider is active."
      >
        <RewardsHealthHero
          providerActive
          issued={94}
          pending={4}
          failed={2}
          totalPaidAmount={478500}
          totalPaidPeriodLabel="This week · May 11 — May 18"
          deltaVsPreviousPeriod={12}
          attentionItems={populatedAttention}
          lastIssuedAt={RECENT_ISSUANCE}
        />
      </Card>

      <Card
        title="Rewards Health Hero — empty / all caught up"
        description="Hero with no escalations and recent issuance."
      >
        <RewardsHealthHero
          providerActive
          issued={188}
          pending={0}
          failed={0}
          totalPaidAmount={940000}
          totalPaidPeriodLabel="This week · May 11 — May 18"
          deltaVsPreviousPeriod={null}
          attentionItems={[]}
          lastIssuedAt={RECENT_ISSUANCE}
        />
      </Card>

      <Card
        title="Rewards Health Hero — provider inactive"
        description="Full-width amber banner replaces the hero when no payouts provider is published."
      >
        <RewardsHealthHero
          providerActive={false}
          issued={0}
          pending={42}
          failed={0}
          totalPaidAmount={0}
          totalPaidPeriodLabel="This week · May 11 — May 18"
          deltaVsPreviousPeriod={null}
          attentionItems={[]}
        />
      </Card>
    </div>
  );
}
