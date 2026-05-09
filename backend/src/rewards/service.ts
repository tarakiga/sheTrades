import { z } from "zod";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logging.js";

type RewardIssueMode = "manual" | "automated";
type RewardIssueStatus = "issued" | "failed";

type RewardRecord = {
  issueId: string;
  phone: string;
  moduleId: number;
  amount: number;
  mode: RewardIssueMode;
  channel: string;
  reason?: string;
  status: RewardIssueStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

type RewardAuditEntry = {
  issueId: string;
  phone: string;
  moduleId: number;
  attempt: number;
  status: "attempted" | "issued" | "failed" | "duplicate";
  message: string;
  timestamp: string;
};

const rewardIssueInputSchema = z.object({
  issueId: z.string().min(1),
  phone: z.string().min(1),
  moduleId: z.number().int().positive(),
  amount: z.number().int().positive().default(200),
  mode: z.enum(["manual", "automated"]),
  channel: z.string().min(1).default("airtime_api"),
  reason: z.string().optional()
});

type RewardIssueInput = z.infer<typeof rewardIssueInputSchema>;

type RewardIssueResult =
  | { status: "issued"; reward: RewardRecord }
  | { status: "duplicate"; reward: RewardRecord }
  | { status: "failed"; reward: RewardRecord; error: string };

const rewardsByIssueId = new Map<string, RewardRecord>();
const rewardIndexByPhone = new Map<string, RewardRecord[]>();
const rewardAuditLog: RewardAuditEntry[] = [];
const providerAttemptState = new Map<string, number>();

function nowIso() {
  return new Date().toISOString();
}

function getRetryPolicy() {
  const attempts = Number(process.env.REWARD_RETRY_ATTEMPTS ?? "3");
  const delayMs = Number(process.env.REWARD_RETRY_DELAY_MS ?? "100");
  return {
    attempts: Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 3,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? Math.floor(delayMs) : 100
  };
}

function providerMode() {
  return process.env.REWARD_PROVIDER_MODE ?? "mock";
}

async function sendToRewardProvider(input: RewardIssueInput): Promise<void> {
  const mode = providerMode();
  const attempt = (providerAttemptState.get(input.issueId) ?? 0) + 1;
  providerAttemptState.set(input.issueId, attempt);

  if (mode === "always_fail") {
    throw new Error("Reward provider unavailable");
  }
  if (mode === "flaky_once" && attempt === 1) {
    throw new Error("Transient reward provider error");
  }
}

function appendAudit(entry: RewardAuditEntry) {
  rewardAuditLog.push(entry);
}

function upsertByPhoneIndex(record: RewardRecord) {
  const list = rewardIndexByPhone.get(record.phone) ?? [];
  const existingIndex = list.findIndex((r) => r.issueId === record.issueId);
  if (existingIndex >= 0) {
    list[existingIndex] = record;
  } else {
    list.push(record);
  }
  rewardIndexByPhone.set(record.phone, list);
}

export async function issueReward(rawInput: unknown): Promise<RewardIssueResult> {
  const input = rewardIssueInputSchema.parse(rawInput);
  const existing = rewardsByIssueId.get(input.issueId);

  if (existing) {
    appendAudit({
      issueId: existing.issueId,
      phone: existing.phone,
      moduleId: existing.moduleId,
      attempt: existing.attempts,
      status: "duplicate",
      message: "Duplicate issue id ignored.",
      timestamp: nowIso()
    });
    return { status: "duplicate", reward: existing };
  }

  const created: RewardRecord = {
    issueId: input.issueId,
    phone: input.phone,
    moduleId: input.moduleId,
    amount: input.amount,
    mode: input.mode,
    channel: input.channel,
    ...(input.reason ? { reason: input.reason } : {}),
    status: "failed",
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const policy = getRetryPolicy();
  try {
    await withRetry(
      async () => {
        created.attempts += 1;
        appendAudit({
          issueId: created.issueId,
          phone: created.phone,
          moduleId: created.moduleId,
          attempt: created.attempts,
          status: "attempted",
          message: "Issuance attempt started.",
          timestamp: nowIso()
        });
        await sendToRewardProvider(input);
      },
      policy.attempts,
      policy.delayMs
    );

    created.status = "issued";
    created.updatedAt = nowIso();
    rewardsByIssueId.set(created.issueId, created);
    upsertByPhoneIndex(created);
    appendAudit({
      issueId: created.issueId,
      phone: created.phone,
      moduleId: created.moduleId,
      attempt: created.attempts,
      status: "issued",
      message: "Reward successfully issued.",
      timestamp: nowIso()
    });
    logger.info("rewards.issue.succeeded", {
      issueId: created.issueId,
      phone: created.phone,
      moduleId: created.moduleId,
      mode: created.mode,
      attempts: created.attempts
    });
    return { status: "issued", reward: created };
  } catch (error) {
    created.status = "failed";
    created.updatedAt = nowIso();
    rewardsByIssueId.set(created.issueId, created);
    upsertByPhoneIndex(created);
    appendAudit({
      issueId: created.issueId,
      phone: created.phone,
      moduleId: created.moduleId,
      attempt: created.attempts,
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown provider failure",
      timestamp: nowIso()
    });
    logger.error("rewards.issue.failed", error, {
      issueId: created.issueId,
      phone: created.phone,
      moduleId: created.moduleId,
      mode: created.mode,
      attempts: created.attempts
    });
    return {
      status: "failed",
      reward: created,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function listRewardsByPhone(phone: string) {
  return rewardIndexByPhone.get(phone) ?? [];
}

export function getRewardAuditLog(phone?: string) {
  if (!phone) return rewardAuditLog;
  return rewardAuditLog.filter((entry) => entry.phone === phone);
}

export function hasIssuedRewardForModule(phone: string, moduleId: number) {
  return listRewardsByPhone(phone).some(
    (reward) => reward.moduleId === moduleId && reward.status === "issued"
  );
}

export function resetRewardServiceState() {
  rewardsByIssueId.clear();
  rewardIndexByPhone.clear();
  rewardAuditLog.length = 0;
  providerAttemptState.clear();
}
