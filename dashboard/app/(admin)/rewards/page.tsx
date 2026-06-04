"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RewardsHealthHero } from "../../../components/rewards/RewardsHealthHero";
import {
  RewardsToolbar,
  type RewardsToolbarDateRange,
  type RewardsToolbarStatus
} from "../../../components/rewards/RewardsToolbar";
import { RewardsTable } from "../../../components/rewards/RewardsTable";
import { RewardDetailDrawer } from "../../../components/rewards/RewardDetailDrawer";
import {
  ManualRewardDrawer,
  type LearnerOption
} from "../../../components/rewards/ManualRewardDrawer";
import type { NeedsAttentionItem } from "../../../components/rewards/NeedsAttentionPanel";
import { Badge, Button, SectionHeader } from "../../../components/ui";
import {
  createManualReward,
  downloadAdminCsv,
  getRewardsPageData,
  getUsersPageData,
  markRewardIssued,
  retryReward,
  rewardsExportEndpoint,
  type RewardsListParams
} from "../../../lib/admin/api";
import type {
  ApiResult,
  RewardLogRow,
  RewardsPageData
} from "../../../lib/admin/contracts";

const DEFAULT_MANUAL_AMOUNT = 5000;
const DEFAULT_MANUAL_CHANNEL = "airtime";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function dateRangeToFrom(range: RewardsToolbarDateRange, now: Date): string | undefined {
  switch (range) {
    case "24h":
      return new Date(now.getTime() - DAY_MS).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * DAY_MS).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * DAY_MS).toISOString();
    case "custom":
    default:
      return undefined;
  }
}

function dateRangePeriodLabel(range: RewardsToolbarDateRange): string {
  switch (range) {
    case "24h":
      return "Last 24 hours";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "custom":
    default:
      return "Custom range";
  }
}

function buildParams(
  status: RewardsToolbarStatus,
  range: RewardsToolbarDateRange,
  query: string
): RewardsListParams {
  const params: RewardsListParams = {};
  if (status !== "All") {
    params.status = status;
  }
  const from = dateRangeToFrom(range, new Date());
  if (from) {
    params.from = from;
  }
  const trimmedQuery = query.trim();
  if (trimmedQuery.length > 0) {
    params.q = trimmedQuery;
  }
  return params;
}

function buildAttentionItems(rewards: Array<RewardLogRow>): Array<NeedsAttentionItem> {
  const now = Date.now();
  const failedInLast24h = rewards.filter((row) => {
    if (row.status !== "Failed") return false;
    const created = new Date(row.createdAt).getTime();
    if (!Number.isFinite(created)) return false;
    return now - created <= DAY_MS;
  }).length;

  const pendingOver6h = rewards.filter((row) => {
    if (row.status !== "Pending") return false;
    const created = new Date(row.createdAt).getTime();
    if (!Number.isFinite(created)) return false;
    return now - created >= 6 * HOUR_MS;
  }).length;

  const items: Array<NeedsAttentionItem> = [];
  if (failedInLast24h > 0) {
    items.push({
      severity: "err",
      title: `${failedInLast24h} failed in last 24h`,
      meta: "Review failure reasons and retry where appropriate"
    });
  }
  if (pendingOver6h > 0) {
    items.push({
      severity: "warn",
      title: `${pendingOver6h} pending > 6h`,
      meta: "Dispatch did not complete within the expected window"
    });
  }
  return items;
}

function findLastIssuedAt(rewards: Array<RewardLogRow>): Date | undefined {
  let latest: number | null = null;
  for (const row of rewards) {
    if (row.status !== "Issued" || !row.issuedAt) continue;
    const issued = new Date(row.issuedAt).getTime();
    if (!Number.isFinite(issued)) continue;
    if (latest === null || issued > latest) {
      latest = issued;
    }
  }
  return latest === null ? undefined : new Date(latest);
}


export default function RewardsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RewardsToolbarStatus>("All");
  const [dateRange, setDateRange] = useState<RewardsToolbarDateRange>("7d");
  const [query, setQuery] = useState<string>("");

  const [result, setResult] = useState<ApiResult<RewardsPageData> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [learnerOptions, setLearnerOptions] = useState<Array<LearnerOption>>([]);

  // The manual-issue picker offers every learner in the directory (keyed by
  // phone, which is what the manual endpoint resolves against) — not just the
  // learners who already appear in the current rewards list.
  useEffect(() => {
    let cancelled = false;
    getUsersPageData()
      .then((res) => {
        if (cancelled) return;
        const options = res.data.users.map((user) => ({
          id: user.phone,
          name: user.name,
          phone: user.phone
        }));
        setLearnerOptions(options);
      })
      .catch(() => {
        if (!cancelled) setLearnerOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const params = useMemo<RewardsListParams>(
    () => buildParams(status, dateRange, query),
    [status, dateRange, query]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getRewardsPageData(params);
      setResult(next);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRewardsPageData(params)
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const rewards = result?.data.rewards ?? [];
  const meta = result?.data.meta ?? { activeProvider: null, nextCursor: null };

  const issued = useMemo(
    () => rewards.filter((row) => row.status === "Issued").length,
    [rewards]
  );
  const pending = useMemo(
    () => rewards.filter((row) => row.status === "Pending").length,
    [rewards]
  );
  const failed = useMemo(
    () => rewards.filter((row) => row.status === "Failed").length,
    [rewards]
  );
  const totalPaidAmount = useMemo(
    () =>
      rewards
        .filter((row) => row.status === "Issued")
        .reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0),
    [rewards]
  );
  const attentionItems = useMemo(() => buildAttentionItems(rewards), [rewards]);
  const lastIssuedAt = useMemo(() => findLastIssuedAt(rewards), [rewards]);

  const openReward = useMemo<RewardLogRow | null>(() => {
    if (!openId) return null;
    return rewards.find((row) => row.id === openId) ?? null;
  }, [openId, rewards]);

  const heroProps = lastIssuedAt
    ? {
        providerActive: meta.activeProvider !== null,
        issued,
        pending,
        failed,
        totalPaidAmount,
        totalPaidPeriodLabel: dateRangePeriodLabel(dateRange),
        deltaVsPreviousPeriod: null as number | null,
        attentionItems,
        lastIssuedAt
      }
    : {
        providerActive: meta.activeProvider !== null,
        issued,
        pending,
        failed,
        totalPaidAmount,
        totalPaidPeriodLabel: dateRangePeriodLabel(dateRange),
        deltaVsPreviousPeriod: null as number | null,
        attentionItems
      };

  function handleOpenRow(id: string) {
    setOpenId(id);
  }

  function handleCloseDetail() {
    setOpenId(null);
  }

  async function handleRetry(id: string) {
    setActionError(null);
    try {
      await retryReward(id);
      await refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Retry failed");
    }
  }

  function handleMarkIssuedFromRow(_id: string) {
    // Inline "Mark Issued" in the table opens the detail drawer so the user
    // can provide the required note + optional provider txn id.
    setOpenId(_id);
  }

  async function handleMarkIssuedFromDrawer(
    id: string,
    note: string,
    providerTxnId?: string
  ) {
    setActionError(null);
    const body: { note: string; providerTxnId?: string } = { note };
    if (providerTxnId) body.providerTxnId = providerTxnId;
    try {
      await markRewardIssued(id, body);
      await refetch();
      setOpenId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Mark issued failed");
      throw error;
    }
  }

  async function handleCreateManual(input: {
    phone: string;
    amount: number;
    channel: string;
    note: string;
  }) {
    setActionError(null);
    try {
      await createManualReward(input);
      setManualOpen(false);
      await refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Manual create failed");
      throw error;
    }
  }

  async function handleExportClick() {
    setActionError(null);
    try {
      await downloadAdminCsv(rewardsExportEndpoint(params), `rewards-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Export failed");
    }
  }

  function handleOpenLearner(_userId: string) {
    // Take the operator to the learner directory, where they can open the
    // full learner profile drawer and act on follow-up state.
    router.push("/users");
  }

  const dataSource = result?.meta.source ?? "fallback";
  const dataMessage = result?.meta.message;

  return (
    <main className="admin-dashboard-page rewards-page">
      <SectionHeader
        title="Rewards"
        description="Monitor reward issuance, failures, and manual intervention workflows."
        actions={
          <div className="rewards-page__actions">
            <Badge variant={dataSource === "live" ? "success" : "warning"}>
              {dataSource === "live" ? "Live Data" : "Fallback Data"}
            </Badge>
            <Button type="button" onClick={() => setManualOpen(true)}>
              Issue Manual Reward
            </Button>
          </div>
        }
      />

      {dataMessage ? (
        <p className="rewards-page__inline-note">{dataMessage}</p>
      ) : null}
      {actionError ? (
        <p className="rewards-page__inline-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <RewardsHealthHero {...heroProps} />

      <RewardsToolbar
        status={status}
        onStatusChange={setStatus}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        query={query}
        onQueryChange={setQuery}
        onExportClick={handleExportClick}
      />

      <RewardsTable
        rewards={rewards}
        loading={loading}
        onOpenRow={handleOpenRow}
        onRetry={handleRetry}
        onMarkIssued={handleMarkIssuedFromRow}
      />

      <RewardDetailDrawer
        reward={openReward}
        open={openReward !== null}
        onClose={handleCloseDetail}
        onRetry={handleRetry}
        onMarkIssued={handleMarkIssuedFromDrawer}
        onOpenLearner={handleOpenLearner}
      />

      <ManualRewardDrawer
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={handleCreateManual}
        defaultAmount={DEFAULT_MANUAL_AMOUNT}
        defaultChannel={DEFAULT_MANUAL_CHANNEL}
        learners={learnerOptions}
      />
    </main>
  );
}
