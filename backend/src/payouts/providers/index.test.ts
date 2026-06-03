import test from "node:test";
import assert from "node:assert/strict";
import { getActiveProvider } from "./index.js";
import { setRuntimeIntegrationConfigForTests } from "../../config-platform/runtime-config.js";

test("getActiveProvider returns null when no integration config is published", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
  const result = await getActiveProvider();
  assert.equal(result, null);
});

test("getActiveProvider returns Africa's Talking adapter when provider=africas_talking", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", {
    provider: "africas_talking",
    sandbox: true,
    africasTalking: { username: "u", apiKey: "k" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  const result = await getActiveProvider();
  assert.equal(result?.provider.key, "africas_talking");
});

test("getActiveProvider passes config through unchanged", async () => {
  setRuntimeIntegrationConfigForTests("integration.payouts.primary", {
    provider: "africas_talking",
    sandbox: false,
    africasTalking: { username: "u2", apiKey: "k2" },
    defaults: { currency: "NGN", channel: "airtime" }
  });
  const result = await getActiveProvider();
  assert.equal(result?.config.sandbox, false);
  if (result && result.config.provider === "africas_talking") {
    assert.equal(result.config.africasTalking.username, "u2");
  }
});
