import test from "node:test";
import assert from "node:assert/strict";
import { termiiAdapter } from "./termii.js";
import type { PayoutsIntegrationPayload, RewardDispatchInput } from "./contracts.js";

function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  const original = globalThis.fetch;
  let index = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[index++] ?? responses[responses.length - 1];
    if (!next) throw new Error("stubFetch ran out of canned responses");
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function firstCall(calls: Array<{ url: string; init: RequestInit }>) {
  const first = calls[0];
  if (!first) throw new Error("stubFetch was never called");
  return first;
}

const baseConfig: PayoutsIntegrationPayload = {
  provider: "termii",
  sandbox: true,
  termii: { apiKey: "test-key", senderId: "SheTrades" },
  defaults: { currency: "NGN", channel: "airtime" }
};

const baseReward: RewardDispatchInput = {
  id: "rwd_t1",
  amount: 500,
  channel: "airtime",
  learnerPhone: "+2348031234567",
  retryCount: 0
};

test("Termii dispatch hits the sandbox URL when config.sandbox is true", async (t) => {
  const { calls, restore } = stubFetch([{ status: 200, body: { code: "ok", transaction_id: "TR-tx-1" } }]);
  t.after(restore);
  await termiiAdapter.dispatch(baseReward, baseConfig);
  assert.match(firstCall(calls).url, /sandbox\.termii\.com/);
});

test("Termii dispatch hits the production URL when sandbox is false", async (t) => {
  const { calls, restore } = stubFetch([{ status: 200, body: { code: "ok", transaction_id: "TR-tx-2" } }]);
  t.after(restore);
  await termiiAdapter.dispatch(baseReward, { ...baseConfig, sandbox: false });
  assert.match(firstCall(calls).url, /api\.ng\.termii\.com/);
  assert.doesNotMatch(firstCall(calls).url, /sandbox/);
});

test("Termii dispatch POSTs JSON with the expected body shape including purchase_code", async (t) => {
  const { calls, restore } = stubFetch([{ status: 200, body: { code: "ok", transaction_id: "TR-tx-3" } }]);
  t.after(restore);
  await termiiAdapter.dispatch({ ...baseReward, retryCount: 2 }, baseConfig);
  const call = firstCall(calls);
  assert.equal(call.init.method, "POST");
  const headers = new Headers(call.init.headers);
  assert.equal(headers.get("content-type"), "application/json");
  const body = JSON.parse(call.init.body as string);
  assert.equal(body.phone_number, "+2348031234567");
  assert.equal(body.api_key, "test-key");
  assert.equal(body.amount, 500);
  assert.equal(body.country_code, "NG");
  assert.equal(body.purchase_code, "reward_rwd_t1_attempt_2");
});

test("Termii dispatch returns ok=true with transaction_id when code=ok", async (t) => {
  const { restore } = stubFetch([{ status: 200, body: { code: "ok", transaction_id: "TR-tx-4" } }]);
  t.after(restore);
  const result = await termiiAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.providerTxnId, "TR-tx-4");
    assert.ok(result.issuedAt instanceof Date);
  }
});

test("Termii dispatch returns retryable=true on HTTP 503", async (t) => {
  const { restore } = stubFetch([{ status: 503, body: { message: "upstream timeout" } }]);
  t.after(restore);
  const result = await termiiAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /503/);
  }
});

test("Termii dispatch returns retryable=false on code=invalid_phone", async (t) => {
  const { restore } = stubFetch([{ status: 200, body: { code: "invalid_phone", message: "bad phone" } }]);
  t.after(restore);
  const result = await termiiAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, false);
    assert.match(result.reason, /invalid_phone|bad phone/);
  }
});

test("Termii dispatch returns retryable=true on code=service_unavailable", async (t) => {
  const { restore } = stubFetch([{ status: 200, body: { code: "service_unavailable", message: "down" } }]);
  t.after(restore);
  const result = await termiiAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
  }
});

test("Termii verifyCredentials returns healthy when get-balance returns numeric balance", async (t) => {
  const { restore } = stubFetch([{ status: 200, body: { balance: 1500 } }]);
  t.after(restore);
  const result = await termiiAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "healthy");
});

test("Termii verifyCredentials returns failed on 401", async (t) => {
  const { restore } = stubFetch([{ status: 401, body: { message: "unauthorized" } }]);
  t.after(restore);
  const result = await termiiAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "failed");
});
