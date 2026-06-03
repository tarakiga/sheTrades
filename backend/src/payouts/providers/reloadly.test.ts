import test from "node:test";
import assert from "node:assert/strict";
import { reloadlyAdapter } from "./reloadly.js";
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

function nthCall(calls: Array<{ url: string; init: RequestInit }>, n: number) {
  const c = calls[n];
  if (!c) throw new Error(`stubFetch call ${n} missing`);
  return c;
}

const TOKEN = "Bearer-test-token";
const tokenResponse = { status: 200, body: { access_token: TOKEN } };

const baseConfig: PayoutsIntegrationPayload = {
  provider: "reloadly",
  sandbox: true,
  reloadly: { clientId: "cid", clientSecret: "csec" },
  defaults: { currency: "NGN", channel: "airtime" }
};

const baseReward: RewardDispatchInput = {
  id: "rwd_r1",
  amount: 500,
  channel: "airtime",
  learnerPhone: "+2348031234567",
  retryCount: 0
};

test("Reloadly dispatch fetches token then calls sandbox topup URL", async (t) => {
  const { calls, restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { status: "SUCCESSFUL", transactionId: 999 } }
  ]);
  t.after(restore);
  await reloadlyAdapter.dispatch(baseReward, baseConfig);
  assert.match(nthCall(calls, 0).url, /auth\.reloadly\.com\/oauth\/token/);
  assert.match(nthCall(calls, 1).url, /topups-sandbox\.reloadly\.com\/topups/);
});

test("Reloadly dispatch uses production audience when sandbox is false", async (t) => {
  const { calls, restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { status: "SUCCESSFUL", transactionId: 1000 } }
  ]);
  t.after(restore);
  await reloadlyAdapter.dispatch(baseReward, { ...baseConfig, sandbox: false });
  assert.match(nthCall(calls, 1).url, /^https:\/\/topups\.reloadly\.com/);
  assert.doesNotMatch(nthCall(calls, 1).url, /sandbox/);
});

test("Reloadly auth request body has the correct shape", async (t) => {
  const { calls, restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { status: "SUCCESSFUL", transactionId: 1001 } }
  ]);
  t.after(restore);
  await reloadlyAdapter.dispatch(baseReward, baseConfig);
  const authCall = nthCall(calls, 0);
  assert.equal(authCall.init.method, "POST");
  const body = JSON.parse(authCall.init.body as string);
  assert.equal(body.client_id, "cid");
  assert.equal(body.client_secret, "csec");
  assert.equal(body.grant_type, "client_credentials");
  assert.match(body.audience, /topups-sandbox\.reloadly\.com/);
});

test("Reloadly topup request body has the correct shape including customIdentifier", async (t) => {
  const { calls, restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { status: "SUCCESSFUL", transactionId: 1002 } }
  ]);
  t.after(restore);
  await reloadlyAdapter.dispatch({ ...baseReward, retryCount: 2 }, baseConfig);
  const topupCall = nthCall(calls, 1);
  assert.equal(topupCall.init.method, "POST");
  const headers = new Headers(topupCall.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`);
  const body = JSON.parse(topupCall.init.body as string);
  assert.equal(body.operatorId, 341);
  assert.equal(body.amount, 500);
  assert.equal(body.useLocalAmount, true);
  assert.equal(body.customIdentifier, "reward_rwd_r1_attempt_2");
  assert.deepEqual(body.recipientPhone, { countryCode: "NG", number: "+2348031234567" });
});

test("Reloadly dispatch returns ok=true on status=SUCCESSFUL with transactionId", async (t) => {
  const { restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { status: "SUCCESSFUL", transactionId: 12345 } }
  ]);
  t.after(restore);
  const result = await reloadlyAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.providerTxnId, "12345");
    assert.ok(result.issuedAt instanceof Date);
  }
});

test("Reloadly dispatch returns retryable=true on topup HTTP 503", async (t) => {
  const { restore } = stubFetch([
    tokenResponse,
    { status: 503, body: { message: "upstream timeout" } }
  ]);
  t.after(restore);
  const result = await reloadlyAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /503/);
  }
});

test("Reloadly dispatch returns retryable=false on errorCode=INVALID_RECIPIENT", async (t) => {
  const { restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { status: "FAILED", errorCode: "INVALID_RECIPIENT", message: "bad number" } }
  ]);
  t.after(restore);
  const result = await reloadlyAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, false);
    assert.match(result.reason, /INVALID_RECIPIENT|bad number/);
  }
});

test("Reloadly dispatch returns retryable=true on errorCode=TIMEOUT", async (t) => {
  const { restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { status: "FAILED", errorCode: "TIMEOUT", message: "slow" } }
  ]);
  t.after(restore);
  const result = await reloadlyAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
  }
});

test("Reloadly verifyCredentials returns healthy when /accounts/balance returns 200", async (t) => {
  const { restore } = stubFetch([
    tokenResponse,
    { status: 200, body: { balance: 2500 } }
  ]);
  t.after(restore);
  const result = await reloadlyAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "healthy");
});

test("Reloadly verifyCredentials returns failed when auth itself fails", async (t) => {
  const { restore } = stubFetch([
    { status: 401, body: { message: "unauthorized" } }
  ]);
  t.after(restore);
  const result = await reloadlyAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "failed");
});
