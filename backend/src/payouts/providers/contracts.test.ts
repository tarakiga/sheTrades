import test from "node:test";
import assert from "node:assert/strict";
import { payoutsIntegrationPayloadSchema } from "./contracts.js";

test("payoutsIntegrationPayloadSchema accepts a valid Africa's Talking payload", () => {
  const parsed = payoutsIntegrationPayloadSchema.parse({
    provider: "africas_talking",
    sandbox: true,
    africasTalking: { username: "sandbox", apiKey: "k" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(parsed.provider, "africas_talking");
});

test("payoutsIntegrationPayloadSchema rejects when the matching credentials block is missing", () => {
  const result = payoutsIntegrationPayloadSchema.safeParse({
    provider: "termii",
    sandbox: false,
    africasTalking: { username: "x", apiKey: "y" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(result.success, false);
});

test("payoutsIntegrationPayloadSchema silently strips credential blocks for non-active providers", () => {
  // Operators commonly leave stale credential blocks after switching
  // provider (fill AT, then switch to Termii, then save). Zod's default
  // .object() strips unknown keys. Document and lock in that contract.
  const parsed = payoutsIntegrationPayloadSchema.parse({
    provider: "termii",
    sandbox: true,
    termii: { apiKey: "live_termii_key" },
    africasTalking: { username: "stale", apiKey: "stale" },
    reloadly: { clientId: "stale", clientSecret: "stale" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(parsed.provider, "termii");
  assert.equal((parsed as Record<string, unknown>).africasTalking, undefined);
  assert.equal((parsed as Record<string, unknown>).reloadly, undefined);
});

test("payoutsIntegrationPayloadSchema accepts Termii with and without senderId", () => {
  const withoutSender = payoutsIntegrationPayloadSchema.parse({
    provider: "termii",
    sandbox: true,
    termii: { apiKey: "k" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(withoutSender.provider, "termii");

  const withSender = payoutsIntegrationPayloadSchema.parse({
    provider: "termii",
    sandbox: false,
    termii: { apiKey: "k", senderId: "SheTrades" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(withSender.provider, "termii");
});

test("payoutsIntegrationPayloadSchema accepts Reloadly", () => {
  const parsed = payoutsIntegrationPayloadSchema.parse({
    provider: "reloadly",
    sandbox: false,
    reloadly: { clientId: "c", clientSecret: "s" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(parsed.provider, "reloadly");
});
