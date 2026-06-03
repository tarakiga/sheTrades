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

test("payoutsIntegrationPayloadSchema rejects when the wrong credentials block is provided", () => {
  const result = payoutsIntegrationPayloadSchema.safeParse({
    provider: "termii",
    sandbox: false,
    africasTalking: { username: "x", apiKey: "y" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  assert.equal(result.success, false);
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
