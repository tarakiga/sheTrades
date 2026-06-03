"use client";

import {
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from "react";
import { formatNgn, formatRelativeTime } from "../../lib/format";

export type RewardLogRow = {
  id: string;
  learner: string;
  learnerPhone: string;
  module: string;
  amount: number;
  currency: "NGN";
  channel: string;
  status: "Issued" | "Pending" | "Failed";
  createdAt: string;
  issuedAt: string | null;
  providerTxnId: string | null;
  failureReason: string | null;
  retryCount: number;
  noteFromActor: string | null;
};

export type RewardsTableProps = {
  rewards: Array<RewardLogRow>;
  onOpenRow: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
  onMarkIssued: (id: string) => void;
  loading?: boolean;
  emptyState?: ReactNode;
};

const SKELETON_ROW_COUNT = 4;

const STATUS_MODIFIER: Record<RewardLogRow["status"], string> = {
  Issued: "rewards-table__status-pill--issued",
  Pending: "rewards-table__status-pill--pending",
  Failed: "rewards-table__status-pill--failed"
};

export function maskPhone(phone: string): string {
  if (!phone) return phone;
  if (phone.length < 10) return phone;
  const head = phone.slice(0, 7);
  const tail = phone.slice(-4);
  return `${head}...${tail}`;
}

function DefaultEmptyState(): ReactElement {
  return (
    <div className="rewards-table__empty-default">
      <p className="rewards-table__empty-default-title">No rewards yet</p>
      <p className="rewards-table__empty-default-body">
        Rewards will appear here once learners complete modules and a payouts
        provider is configured.
      </p>
    </div>
  );
}

function SkeletonRow(): ReactElement {
  return (
    <tr className="rewards-table__row rewards-table__row--skeleton" aria-hidden>
      <td className="rewards-table__cell">
        <span className="rewards-table__skeleton rewards-table__skeleton--lg" />
        <span className="rewards-table__skeleton rewards-table__skeleton--sm" />
      </td>
      <td className="rewards-table__cell">
        <span className="rewards-table__skeleton rewards-table__skeleton--lg" />
      </td>
      <td className="rewards-table__cell">
        <span className="rewards-table__skeleton rewards-table__skeleton--sm" />
      </td>
      <td className="rewards-table__cell">
        <span className="rewards-table__skeleton rewards-table__skeleton--md" />
      </td>
      <td className="rewards-table__cell">
        <span className="rewards-table__skeleton rewards-table__skeleton--pill" />
      </td>
      <td className="rewards-table__cell rewards-table__cell--actions" />
    </tr>
  );
}

type RowProps = {
  reward: RewardLogRow;
  onOpenRow: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
  onMarkIssued: (id: string) => void;
};

function Row({
  reward,
  onOpenRow,
  onRetry,
  onMarkIssued
}: RowProps): ReactElement {
  const [retrying, setRetrying] = useState<boolean>(false);

  function stop(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  function handleRowClick() {
    onOpenRow(reward.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenRow(reward.id);
    }
  }

  async function handleRetry(event: MouseEvent<HTMLButtonElement>) {
    stop(event);
    if (retrying) return;
    try {
      setRetrying(true);
      await onRetry(reward.id);
    } finally {
      setRetrying(false);
    }
  }

  function handleMarkIssued(event: MouseEvent<HTMLButtonElement>) {
    stop(event);
    onMarkIssued(reward.id);
  }

  function handleOpen(event: MouseEvent<HTMLButtonElement>) {
    stop(event);
    onOpenRow(reward.id);
  }

  const showRetry = reward.status === "Pending" || reward.status === "Failed";
  const showMarkIssued = reward.status === "Pending";

  const statusClass = [
    "rewards-table__status-pill",
    STATUS_MODIFIER[reward.status]
  ].join(" ");

  return (
    <tr
      className="rewards-table__row"
      tabIndex={0}
      role="button"
      aria-label={`Open reward for ${reward.learner}, ${reward.status.toLowerCase()}`}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
    >
      <td className="rewards-table__cell rewards-table__cell--learner">
        <span className="rewards-table__learner-name">{reward.learner}</span>
        <span className="rewards-table__learner-phone">
          {maskPhone(reward.learnerPhone)}
        </span>
      </td>
      <td className="rewards-table__cell">
        <span className="rewards-table__module">{reward.module}</span>
      </td>
      <td className="rewards-table__cell rewards-table__cell--amount">
        {formatNgn(reward.amount)}
      </td>
      <td className="rewards-table__cell">
        <span className="rewards-table__channel">{reward.channel}</span>
        <span className="rewards-table__when">
          {formatRelativeTime(reward.createdAt)}
        </span>
      </td>
      <td className="rewards-table__cell">
        <span className={statusClass}>{reward.status}</span>
      </td>
      <td className="rewards-table__cell rewards-table__cell--actions">
        <div className="rewards-table__actions">
          {showRetry ? (
            <button
              type="button"
              className="rewards-table__action rewards-table__action--retry"
              onClick={handleRetry}
              disabled={retrying}
              aria-busy={retrying}
            >
              {retrying ? "Retrying…" : "Retry now"}
            </button>
          ) : null}
          {showMarkIssued ? (
            <button
              type="button"
              className="rewards-table__action rewards-table__action--mark"
              onClick={handleMarkIssued}
            >
              Mark Issued
            </button>
          ) : null}
          <button
            type="button"
            className="rewards-table__action rewards-table__action--open"
            onClick={handleOpen}
          >
            Open
          </button>
        </div>
      </td>
    </tr>
  );
}

export function RewardsTable(props: RewardsTableProps): ReactElement {
  const loading = props.loading === true;
  const isEmpty = !loading && props.rewards.length === 0;

  return (
    <div className="rewards-table" role="region" aria-label="Rewards log">
      <table className="rewards-table__table">
        <thead className="rewards-table__head">
          <tr>
            <th scope="col" className="rewards-table__th">
              Learner
            </th>
            <th scope="col" className="rewards-table__th">
              Module
            </th>
            <th scope="col" className="rewards-table__th rewards-table__th--amount">
              Amount
            </th>
            <th scope="col" className="rewards-table__th">
              Channel · When
            </th>
            <th scope="col" className="rewards-table__th">
              Status
            </th>
            <th scope="col" className="rewards-table__th rewards-table__th--actions">
              <span className="rewards-table__sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="rewards-table__body">
          {loading
            ? Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                <SkeletonRow key={`skeleton-${index}`} />
              ))
            : props.rewards.map((reward) => (
                <Row
                  key={reward.id}
                  reward={reward}
                  onOpenRow={props.onOpenRow}
                  onRetry={props.onRetry}
                  onMarkIssued={props.onMarkIssued}
                />
              ))}
        </tbody>
      </table>
      {isEmpty ? (
        <div className="rewards-table__empty">
          {props.emptyState ?? <DefaultEmptyState />}
        </div>
      ) : null}
    </div>
  );
}
