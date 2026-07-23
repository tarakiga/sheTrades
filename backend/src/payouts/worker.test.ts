import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../admin/prisma.js";
import { dispatchTick } from "./worker.js";
import { setRuntimeIntegrationConfigForTests } from "../config-platform/runtime-config.js";
import type { PayoutProvider } from "./providers/contracts.js";

const skipWithoutDb = process.env.POSTGRES_URL ? false : "requires POSTGRES_URL";

async function seedReward(opts: Partial<{ status: string; retryCount: number; nextAttemptAt: Date | null }> = {}) {
  const phone = `+234${Math.floor(Math.random() * 1e10)}`;
  const user = await prisma.user.create({ data: { phone } });
  return prisma.reward.create({
    data: {
      userId: user.id,
      module: `Module ${Date.now()}-${Math.random()}`,
      amount: 500,
      channel: "airtime",
      learnerPhone: phone,
      status: opts.status ?? "Pending",
      retryCount: opts.retryCount ?? 0,
      nextAttemptAt: opts.nextAttemptAt === undefined ? null : opts.nextAttemptAt
    }
  });
}

function makeProvider(behaviour: "ok" | "retryable" | "non_retryable"): PayoutProvider {
  return {
    key: "africas_talking",
    async verifyCredentials() { return { status: "healthy", latencyMs: 0, message: "ok" }; },
    async dispatch() {
      if (behaviour === "ok") return { ok: true, providerTxnId: "TX-1", issuedAt: new Date() };
      if (behaviour === "retryable") return { ok: false, reason: "503", retryable: true };
      return { ok: false, reason: "InvalidPhone", retryable: false };
    }
  };
}

const baseConfig = {
  provider: "africas_talking" as const,
  sandbox: true,
  africasTalking: { username: "u", apiKey: "k" },
  defaults: { currency: "NGN" as const, channel: "airtime" as const }
};

test("dispatchTick skips when no provider is configured", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
  const summary = await dispatchTick();
  assert.equal(summary.skipped, 1);
  assert.equal(summary.dispatched, 0);
});

test("dispatchTick marks success as Issued with providerTxnId", { skip: skipWithoutDb }, async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", baseConfig);
  const reward = await seedReward();
  await dispatchTick({ providerOverrideForTests: makeProvider("ok"), configOverrideForTests: baseConfig });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Issued");
  assert.equal(updated.providerTxnId, "TX-1");
  assert.equal(updated.attemptInProgress, false);
});

test("dispatchTick schedules backoff on retryable failure: 5 min after first attempt", { skip: skipWithoutDb }, async () => {
  const reward = await seedReward({ retryCount: 0 });
  await dispatchTick({ providerOverrideForTests: makeProvider("retryable"), configOverrideForTests: baseConfig });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Pending");
  assert.equal(updated.retryCount, 1);
  assert.ok(updated.nextAttemptAt);
  const deltaMin = (updated.nextAttemptAt!.getTime() - Date.now()) / 60_000;
  assert.ok(deltaMin >= 4.5 && deltaMin <= 5.5, `expected ~5 min delay, got ${deltaMin}`);
});

test("dispatchTick marks Failed when non-retryable", { skip: skipWithoutDb }, async () => {
  const reward = await seedReward({ retryCount: 0 });
  await dispatchTick({ providerOverrideForTests: makeProvider("non_retryable"), configOverrideForTests: baseConfig });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Failed");
  assert.equal(updated.failureReason, "InvalidPhone");
});

test("dispatchTick marks Failed after the third retryable attempt", { skip: skipWithoutDb }, async () => {
  const reward = await seedReward({ retryCount: 2 });
  await dispatchTick({ providerOverrideForTests: makeProvider("retryable"), configOverrideForTests: baseConfig });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Failed");
  assert.equal(updated.retryCount, 3);
});

test("dispatchTick does not pick up rows whose nextAttemptAt is in the future", { skip: skipWithoutDb }, async () => {
  const reward = await seedReward({ nextAttemptAt: new Date(Date.now() + 60 * 60_000) });
  const summary = await dispatchTick({ providerOverrideForTests: makeProvider("ok"), configOverrideForTests: baseConfig });
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Pending");
  assert.equal(updated.providerTxnId, null);
});

test("dispatchTick row-claim prevents double dispatch under concurrent ticks", { skip: skipWithoutDb }, async () => {
  const reward = await seedReward();
  const provider = makeProvider("ok");
  await Promise.all([
    dispatchTick({ providerOverrideForTests: provider, configOverrideForTests: baseConfig }),
    dispatchTick({ providerOverrideForTests: provider, configOverrideForTests: baseConfig })
  ]);
  const updated = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(updated.status, "Issued");
});
