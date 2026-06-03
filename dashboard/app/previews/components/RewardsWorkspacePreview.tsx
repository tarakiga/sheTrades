"use client";

import { useEffect, useRef, useState } from "react";
import { Card, SectionHeader } from "../../../components/ui";
import { IssuanceSuccessGauge } from "../../../components/rewards/IssuanceSuccessGauge";
import { TotalPaidHeadline } from "../../../components/rewards/TotalPaidHeadline";
import {
  NeedsAttentionPanel,
  type NeedsAttentionItem
} from "../../../components/rewards/NeedsAttentionPanel";
import { RewardsHealthHero } from "../../../components/rewards/RewardsHealthHero";
import {
  RewardsToolbar,
  type RewardsToolbarDateRange,
  type RewardsToolbarStatus
} from "../../../components/rewards/RewardsToolbar";
import {
  RewardsTable,
  type RewardLogRow
} from "../../../components/rewards/RewardsTable";
import { RewardDetailDrawer } from "../../../components/rewards/RewardDetailDrawer";
import {
  ManualRewardDrawer,
  type LearnerOption
} from "../../../components/rewards/ManualRewardDrawer";

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

function ToolbarVariantDefault() {
  const [status, setStatus] = useState<RewardsToolbarStatus>("All");
  const [dateRange, setDateRange] = useState<RewardsToolbarDateRange>("7d");
  const [query, setQuery] = useState<string>("");
  return (
    <RewardsToolbar
      status={status}
      onStatusChange={setStatus}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      query={query}
      onQueryChange={setQuery}
      onExportClick={() => undefined}
    />
  );
}

function ToolbarVariantFiltered() {
  const [status, setStatus] = useState<RewardsToolbarStatus>("Failed");
  const [dateRange, setDateRange] = useState<RewardsToolbarDateRange>("24h");
  const [query, setQuery] = useState<string>("adaeze");
  return (
    <RewardsToolbar
      status={status}
      onStatusChange={setStatus}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      query={query}
      onQueryChange={setQuery}
      onExportClick={() => undefined}
    />
  );
}

const MOCK_REWARDS: Array<RewardLogRow> = [
  {
    id: "rwd_001",
    learner: "Adaeze Okonkwo",
    learnerPhone: "+2348031234567",
    module: "Module 3 · Pricing your craft",
    amount: 5000,
    currency: "NGN",
    channel: "Airtime · Reloadly",
    status: "Issued",
    createdAt: new Date(STABLE_NOW.getTime() - 35 * 60 * 1000).toISOString(),
    issuedAt: new Date(STABLE_NOW.getTime() - 33 * 60 * 1000).toISOString(),
    providerTxnId: "RLY-9F12-77AC-001",
    failureReason: null,
    retryCount: 0,
    noteFromActor: null
  },
  {
    id: "rwd_002",
    learner: "Funmi Adebayo",
    learnerPhone: "+2347061122334",
    module: "Module 1 · WhatsApp basics",
    amount: 3000,
    currency: "NGN",
    channel: "Airtime · Africa's Talking",
    status: "Pending",
    createdAt: new Date(STABLE_NOW.getTime() - 8 * 60 * 1000).toISOString(),
    issuedAt: null,
    providerTxnId: null,
    failureReason: null,
    retryCount: 1,
    noteFromActor: null
  },
  {
    id: "rwd_003",
    learner: "Chinwe Okoro",
    learnerPhone: "+2348099887766",
    module: "Module 2 · Photographing products",
    amount: 4500,
    currency: "NGN",
    channel: "Airtime · Reloadly",
    status: "Failed",
    createdAt: new Date(STABLE_NOW.getTime() - 22 * 60 * 1000).toISOString(),
    issuedAt: null,
    providerTxnId: null,
    failureReason: "INSUFFICIENT_FUNDS — top up Reloadly wallet",
    retryCount: 3,
    noteFromActor: null
  },
  {
    id: "rwd_004",
    learner: "Aisha Yusuf",
    learnerPhone: "+2349055443322",
    module: "Module 4 · Selling on marketplaces",
    amount: 6000,
    currency: "NGN",
    channel: "Bank · Termii",
    status: "Issued",
    createdAt: new Date(STABLE_NOW.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    issuedAt: new Date(
      STABLE_NOW.getTime() - 4 * 60 * 60 * 1000 + 90 * 1000
    ).toISOString(),
    providerTxnId: "TMR-0044-MAY-2026",
    failureReason: null,
    retryCount: 0,
    noteFromActor: "Re-issued by ops after first attempt timed out."
  }
];

const ISSUED_REWARD: RewardLogRow = MOCK_REWARDS[0] as RewardLogRow;
const PENDING_REWARD: RewardLogRow = MOCK_REWARDS[1] as RewardLogRow;
const FAILED_REWARD: RewardLogRow = MOCK_REWARDS[2] as RewardLogRow;

const MOCK_LEARNERS: Array<LearnerOption> = [
  { id: "lr_001", name: "Adaeze Okonkwo", phone: "+2348031234567" },
  { id: "lr_002", name: "Funmi Adebayo", phone: "+2347061122334" },
  { id: "lr_003", name: "Chinwe Okoro", phone: "+2348099887766" },
  { id: "lr_004", name: "Aisha Yusuf", phone: "+2349055443322" }
];

const PRE_SELECTED_LEARNER: LearnerOption = MOCK_LEARNERS[0] as LearnerOption;

function ManualRewardEmptyVariant() {
  return (
    <ManualRewardDrawer
      open
      onClose={noop}
      onSubmit={noopAsync}
      defaultAmount={5000}
      defaultChannel="airtime"
      learners={MOCK_LEARNERS}
    />
  );
}

function ManualRewardPrefilledVariant() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // Simulate the learner being selected from the autocomplete by
    // clicking the first suggestion. We type a query first so the
    // suggestion list opens.
    const input = frame.querySelector<HTMLInputElement>(
      "input.manual-reward-drawer__input"
    );
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, PRE_SELECTED_LEARNER.name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    // Fill the note so the form is ready-to-submit.
    const note = frame.querySelector<HTMLTextAreaElement>(
      "textarea.manual-reward-drawer__textarea"
    );
    if (note) {
      const noteSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      noteSetter?.call(
        note,
        "Issued manually after Reloadly outage on 2026-05-18."
      );
      note.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Click the first suggestion to lock the learner in.
    window.requestAnimationFrame(() => {
      const suggestion = frame.querySelector<HTMLButtonElement>(
        "button.manual-reward-drawer__suggestion-btn"
      );
      suggestion?.click();
    });
  }, []);
  return (
    <div className="preview-drawer-frame" ref={frameRef}>
      <ManualRewardDrawer
        open
        onClose={noop}
        onSubmit={noopAsync}
        defaultAmount={5000}
        defaultChannel="airtime"
        learners={MOCK_LEARNERS}
      />
    </div>
  );
}

function ManualRewardValidationErrorVariant() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // Submitting an empty form surfaces validation errors next to
    // every required field.
    const form = frame.querySelector<HTMLFormElement>(
      "form.manual-reward-drawer__form"
    );
    if (!form) return;
    window.requestAnimationFrame(() => {
      form.requestSubmit();
    });
  }, []);
  return (
    <div className="preview-drawer-frame" ref={frameRef}>
      <ManualRewardDrawer
        open
        onClose={noop}
        onSubmit={noopAsync}
        defaultAmount={5000}
        defaultChannel="airtime"
        learners={MOCK_LEARNERS}
      />
    </div>
  );
}

function noop(): void {
  /* preview only */
}

async function noopAsync(): Promise<void> {
  /* preview only */
}

function ToolbarVariantExporting() {
  const [status, setStatus] = useState<RewardsToolbarStatus>("Pending");
  const [dateRange, setDateRange] = useState<RewardsToolbarDateRange>("30d");
  const [query, setQuery] = useState<string>("");
  return (
    <RewardsToolbar
      status={status}
      onStatusChange={setStatus}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      query={query}
      onQueryChange={setQuery}
      onExportClick={() => undefined}
      exporting
    />
  );
}

export function RewardsWorkspacePreview() {
  const markIssuedFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = markIssuedFrameRef.current;
    if (!frame) return;
    // Auto-click the "Mark Issued" footer button so the preview shows the
    // inline mark-issued form mode. We identify the button by text rather
    // than by class to keep the preview decoupled from CSS class names.
    const buttons = frame.querySelectorAll<HTMLButtonElement>(
      "button.reward-detail-drawer__btn--primary"
    );
    for (const button of buttons) {
      if (button.textContent?.trim() === "Mark Issued") {
        button.click();
        break;
      }
    }
  }, []);

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

      <Card
        title="Rewards Toolbar"
        description="Sticky strip below the hero: status pills, date range select, debounced search, export CSV. Search input debounces at 300ms before reporting changes upstream."
      >
        <div className="preview-card-content">
          <div>
            <ToolbarVariantDefault />
            <p className="preview-card-content__caption">
              Default — status: All, range: Last 7 days, no query, idle export
              button.
            </p>
          </div>
          <div>
            <ToolbarVariantFiltered />
            <p className="preview-card-content__caption">
              Filtered — status: Failed (danger accent), range: Last 24 hours,
              search prefilled with "adaeze".
            </p>
          </div>
          <div>
            <ToolbarVariantExporting />
            <p className="preview-card-content__caption">
              Exporting — status: Pending (warning accent), range: Last 30 days,
              export button locked with spinner.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Rewards Table — loading"
        description="Skeleton rows while the API call resolves."
      >
        <RewardsTable
          rewards={[]}
          loading
          onOpenRow={noop}
          onRetry={noopAsync}
          onMarkIssued={noop}
        />
      </Card>

      <Card
        title="Rewards Table — empty"
        description="No rewards match the current filters."
      >
        <RewardsTable
          rewards={[]}
          onOpenRow={noop}
          onRetry={noopAsync}
          onMarkIssued={noop}
        />
      </Card>

      <Card
        title="Rewards Table — populated"
        description="Row hover/focus reveals status-gated inline actions. Issued rows show Open only; Pending shows Retry · Mark Issued · Open; Failed shows Retry · Open."
      >
        <RewardsTable
          rewards={MOCK_REWARDS}
          onOpenRow={noop}
          onRetry={noopAsync}
          onMarkIssued={noop}
        />
      </Card>

      <Card
        title="Reward Detail Drawer — closed"
        description="When reward is null and open is false, the drawer renders nothing."
      >
        <p className="preview-card-content__caption">
          (Nothing renders below — closed drawer is a no-op.)
        </p>
        <RewardDetailDrawer
          reward={null}
          open={false}
          onClose={noop}
          onRetry={noopAsync}
          onMarkIssued={noopAsync}
          onOpenLearner={noop}
        />
      </Card>

      <Card
        title="Reward Detail Drawer — Pending"
        description="Right-side drawer with identity card, issuance timeline, action footer. Footer shows Retry now and Mark Issued."
      >
        <div className="preview-drawer-frame">
          <RewardDetailDrawer
            reward={PENDING_REWARD}
            open
            onClose={noop}
            onRetry={noopAsync}
            onMarkIssued={noopAsync}
            onOpenLearner={noop}
          />
        </div>
      </Card>

      <Card
        title="Reward Detail Drawer — Failed"
        description="Failure reason surfaces in the provider details section. Footer shows Retry now only."
      >
        <div className="preview-drawer-frame">
          <RewardDetailDrawer
            reward={FAILED_REWARD}
            open
            onClose={noop}
            onRetry={noopAsync}
            onMarkIssued={noopAsync}
            onOpenLearner={noop}
          />
        </div>
      </Card>

      <Card
        title="Reward Detail Drawer — Issued"
        description="Provider txn id and issued-at timestamp visible. Footer shows Open learner link only."
      >
        <div className="preview-drawer-frame">
          <RewardDetailDrawer
            reward={ISSUED_REWARD}
            open
            onClose={noop}
            onRetry={noopAsync}
            onMarkIssued={noopAsync}
            onOpenLearner={noop}
          />
        </div>
      </Card>

      <Card
        title="Reward Detail Drawer — Mark Issued form"
        description="Inline form mode: note textarea (min 10 chars, required) and optional provider txn id. Click the Mark Issued button in the preview above to see this state live, or this card simulates the form state via auto-click on mount."
      >
        <div className="preview-drawer-frame" ref={markIssuedFrameRef}>
          <RewardDetailDrawer
            reward={PENDING_REWARD}
            open
            onClose={noop}
            onRetry={noopAsync}
            onMarkIssued={noopAsync}
            onOpenLearner={noop}
          />
        </div>
      </Card>

      <Card
        title="Manual Reward Drawer — closed"
        description="When open is false the drawer renders nothing."
      >
        <p className="preview-card-content__caption">
          (Nothing renders below — closed drawer is a no-op.)
        </p>
        <ManualRewardDrawer
          open={false}
          onClose={noop}
          onSubmit={noopAsync}
          defaultAmount={5000}
          defaultChannel="airtime"
          learners={MOCK_LEARNERS}
        />
      </Card>

      <Card
        title="Manual Reward Drawer — empty form"
        description="Default state with no fields touched. Amount and channel show their defaults; the learner is unselected."
      >
        <div className="preview-drawer-frame">
          <ManualRewardEmptyVariant />
        </div>
      </Card>

      <Card
        title="Manual Reward Drawer — pre-filled valid"
        description="A learner is pre-selected via the autocomplete and the reason note is populated, so the form is ready to submit."
      >
        <ManualRewardPrefilledVariant />
      </Card>

      <Card
        title="Manual Reward Drawer — validation errors"
        description="Submitting the empty form surfaces inline errors next to every required field. The card auto-submits on mount to simulate this state."
      >
        <ManualRewardValidationErrorVariant />
      </Card>
    </div>
  );
}
