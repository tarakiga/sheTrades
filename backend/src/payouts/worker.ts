import { prisma } from "../admin/prisma.js";
import { getActiveProvider } from "./providers/index.js";
import type { PayoutProvider, PayoutsIntegrationPayload } from "./providers/contracts.js";

export type DispatchTickSummary = {
  scannedAt: string;
  examined: number;
  dispatched: number;
  retried: number;
  movedToFailed: number;
  skipped: number;
};

type DispatchTickOptions = {
  providerOverrideForTests?: PayoutProvider;
  configOverrideForTests?: PayoutsIntegrationPayload;
  batchLimit?: number;
};

const BATCH_LIMIT = 50;
const RETRY_CEILING = 3;
const BASE_DELAY_MS = 5 * 60_000;

export async function dispatchTick(opts: DispatchTickOptions = {}): Promise<DispatchTickSummary> {
  const started = new Date();
  const summary: DispatchTickSummary = {
    scannedAt: started.toISOString(),
    examined: 0,
    dispatched: 0,
    retried: 0,
    movedToFailed: 0,
    skipped: 0
  };

  let provider: PayoutProvider | undefined = opts.providerOverrideForTests;
  let config: PayoutsIntegrationPayload | undefined = opts.configOverrideForTests;
  if (!provider) {
    const active = await getActiveProvider();
    if (!active) {
      summary.skipped += 1;
      console.log(JSON.stringify({ event: "payouts.tick.skip", reason: "no_active_provider" }));
      return summary;
    }
    provider = active.provider;
    config = active.config;
  }

  const candidates = await prisma.reward.findMany({
    where: {
      status: { in: ["Pending", "Failed"] },
      retryCount: { lt: RETRY_CEILING },
      attemptInProgress: false,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: started } }]
    },
    orderBy: { createdAt: "asc" },
    take: opts.batchLimit ?? BATCH_LIMIT
  });
  summary.examined = candidates.length;

  for (const candidate of candidates) {
    const claim = await prisma.reward.updateMany({
      where: { id: candidate.id, attemptInProgress: false },
      data: { attemptInProgress: true }
    });
    if (claim.count === 0) continue;

    const tStart = Date.now();
    const result = await provider.dispatch(
      {
        id: candidate.id,
        amount: candidate.amount,
        channel: candidate.channel,
        learnerPhone: candidate.learnerPhone,
        retryCount: candidate.retryCount
      },
      config ?? ({ provider: provider.key } as PayoutsIntegrationPayload)
    );
    const latencyMs = Date.now() - tStart;

    if (result.ok) {
      await prisma.reward.update({
        where: { id: candidate.id },
        data: {
          status: "Issued",
          issuedAt: result.issuedAt,
          providerTxnId: result.providerTxnId,
          failureReason: null,
          attemptInProgress: false
        }
      });
      summary.dispatched += 1;
      console.log(JSON.stringify({
        event: "payouts.dispatch",
        rewardId: candidate.id,
        provider: provider.key,
        sandbox: config?.sandbox,
        status: "Issued",
        providerTxnId: result.providerTxnId,
        retryCount: candidate.retryCount,
        latencyMs
      }));
    } else if (result.retryable && candidate.retryCount + 1 < RETRY_CEILING) {
      const delayMs = Math.pow(2, candidate.retryCount) * BASE_DELAY_MS;
      await prisma.reward.update({
        where: { id: candidate.id },
        data: {
          retryCount: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + delayMs),
          failureReason: result.reason,
          attemptInProgress: false,
          status: "Pending"
        }
      });
      summary.retried += 1;
      console.log(JSON.stringify({
        event: "payouts.dispatch",
        rewardId: candidate.id,
        provider: provider.key,
        sandbox: config?.sandbox,
        status: "RetryQueued",
        retryCount: candidate.retryCount + 1,
        nextDelayMs: delayMs,
        reason: result.reason,
        latencyMs
      }));
    } else {
      await prisma.reward.update({
        where: { id: candidate.id },
        data: {
          status: "Failed",
          retryCount: { increment: 1 },
          failureReason: result.reason,
          attemptInProgress: false
        }
      });
      summary.movedToFailed += 1;
      console.log(JSON.stringify({
        event: "payouts.dispatch",
        rewardId: candidate.id,
        provider: provider.key,
        sandbox: config?.sandbox,
        status: "Failed",
        retryCount: candidate.retryCount + 1,
        reason: result.reason,
        latencyMs
      }));
    }
  }

  console.log(JSON.stringify({
    event: "payouts.tick.summary",
    ...summary,
    tickDurationMs: Date.now() - started.getTime()
  }));
  return summary;
}
