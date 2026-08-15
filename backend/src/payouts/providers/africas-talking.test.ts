import test from "node:test";
import assert from "node:assert/strict";
import { africasTalkingAdapter } from "./africas-talking.js";
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
  const c = calls[0];
  if (!c) throw new Error("expected fetch to have been called");
  return c;
}

const baseConfig: PayoutsIntegrationPayload = {
  provider: "africas_talking",
  sandbox: true,
  africasTalking: { username: "sandbox", apiKey: "test-key" },
  defaults: { currency: "NGN", channel: "airtime" }
};

const baseReward: RewardDispatchInput = {
  id: "rwd_1",
  amount: 500,
  channel: "airtime",
  learnerPhone: "+2348031234567",
  retryCount: 0
};

test("dispatch hits the sandbox URL when config.sandbox is true", async (t) => {
  const { calls, restore } = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-1" }] } }]);
  t.after(restore);
  await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.match(firstCall(calls).url, /api\.sandbox\.africastalking\.com/);
});

test("dispatch hits the production URL when config.sandbox is false", async (t) => {
  const { calls, restore } = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-2" }] } }]);
  t.after(restore);
  await africasTalkingAdapter.dispatch(baseReward, { ...baseConfig, sandbox: false });
  assert.match(firstCall(calls).url, /api\.africastalking\.com/);
  assert.doesNotMatch(firstCall(calls).url, /sandbox/);
});

test("dispatch sets the apiKey header and uses POST", async (t) => {
  const { calls, restore } = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-3" }] } }]);
  t.after(restore);
  await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(firstCall(calls).init.method, "POST");
  const headers = new Headers(firstCall(calls).init.headers);
  assert.equal(headers.get("apiKey"), "test-key");
});

test("dispatch sends the AT contract shape: combined 'NGN 500' amount string, no currencyCode field", async (t) => {
  // Verified against the real sandbox 2026-08-15: separate currencyCode/amount
  // fields are rejected with a misleading HTTP 415; the combined string sends.
  const { calls, restore } = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", requestId: "ATQid_4" }] } }]);
  t.after(restore);
  await africasTalkingAdapter.dispatch({ ...baseReward, retryCount: 2 }, baseConfig);
  const body = new URLSearchParams(firstCall(calls).init.body as string);
  const recipients = JSON.parse(body.get("recipients") ?? "[]") as Array<Record<string, unknown>>;
  const recipient = recipients[0];
  assert.ok(recipient, "expected at least one recipient");
  assert.equal(recipient.phoneNumber, "+2348031234567");
  assert.equal(recipient.amount, "NGN 500");
  assert.equal("currencyCode" in recipient, false);
});

test("dispatch returns ok=true with requestId as the provider transaction id on Sent", async (t) => {
  // Real sandbox response shape: {status:"Sent", requestId:"ATQid_...", ...}
  const { restore } = stubFetch([
    { status: 201, body: { responses: [{ status: "Sent", requestId: "ATQid_5", errorMessage: "None" }] } }
  ]);
  t.after(restore);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.providerTxnId, "ATQid_5");
    assert.ok(result.issuedAt instanceof Date);
  }
});

test("dispatch still accepts legacy transactionId as the provider transaction id", async (t) => {
  const { restore } = stubFetch([{ status: 201, body: { responses: [{ status: "Sent", transactionId: "AT-tx-5" }] } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.providerTxnId, "AT-tx-5");
  }
});

test("dispatch returns retryable=true on HTTP 503", async (t) => {
  const { restore } = stubFetch([{ status: 503, body: { message: "upstream timeout" } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /503/);
  }
});

test("dispatch returns retryable=false on HTTP 400 with invalid recipient", async (t) => {
  const { restore } = stubFetch([{ status: 201, body: { responses: [{ status: "InvalidPhoneNumber", errorMessage: "bad phone" }] } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, false);
    assert.match(result.reason, /InvalidPhoneNumber|bad phone/);
  }
});

test("verifyCredentials returns healthy when account balance fetch returns 200", async (t) => {
  const { restore } = stubFetch([{ status: 200, body: { UserData: { balance: "NGN 1000" } } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "healthy");
});

test("verifyCredentials returns failed when account balance returns 401", async (t) => {
  const { restore } = stubFetch([{ status: 401, body: { message: "unauthorized" } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.verifyCredentials(baseConfig);
  assert.equal(result.status, "failed");
});

test("dispatch returns retryable=true on HTTP 429 (rate-limited)", async (t) => {
  const { restore } = stubFetch([{ status: 429, body: { message: "rate limited" } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /429/);
  }
});

test("dispatch returns retryable=true on HTTP 408 (request timeout)", async (t) => {
  const { restore } = stubFetch([{ status: 408, body: { message: "timeout" } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /408/);
  }
});

test("dispatch returns retryable=true when fetch itself throws (network/parse error)", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /ECONNRESET/);
  }
});

test("dispatch returns retryable=true when responses[] is empty", async (t) => {
  const { restore } = stubFetch([{ status: 201, body: { responses: [] } }]);
  t.after(restore);
  const result = await africasTalkingAdapter.dispatch(baseReward, baseConfig);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.reason, /Empty/);
  }
});
