import test from "node:test";
import assert from "node:assert/strict";
import { rewardRulesPayloadSchema, configPayloadSchema } from "./contracts.js";

test("rewardRulesPayloadSchema accepts a valid rule", () => {
  const r = rewardRulesPayloadSchema.parse({ kind: "reward_rules", amount: 750, channel: "airtime", enabled: true });
  assert.equal(r.amount, 750);
});

test("configPayloadSchema routes a reward-rule payload to the reward-rules member", () => {
  const parsed = configPayloadSchema.parse({ kind: "reward_rules", amount: 500, channel: "airtime", enabled: false });
  assert.equal((parsed as { kind?: string }).kind, "reward_rules");
});

test("rewardRulesPayloadSchema rejects a non-positive amount", () => {
  const r = rewardRulesPayloadSchema.safeParse({ kind: "reward_rules", amount: 0, channel: "airtime", enabled: true });
  assert.equal(r.success, false);
});
