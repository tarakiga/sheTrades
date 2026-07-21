import test from "node:test";
import assert from "node:assert/strict";
import {
  providersSupporting,
  translationIntegrationPayloadSchema
} from "./contracts.js";

test("a minimal config fills in safe provider defaults", () => {
  const parsed = translationIntegrationPayloadSchema.parse({
    title: "Primary Translation Integration",
    providerByLanguage: {}
  });
  // Gemini rather than igbo_api, because it is the only default that can
  // produce BOTH target languages — an igbo_api default would leave Pidgin
  // silently unproducible on a fresh install.
  assert.equal(parsed.providerByLanguage.pcm, "gemini");
  assert.equal(parsed.providerByLanguage.ig, "gemini");
  assert.equal(parsed.enabled, true);
});

test("the Igbo API daily request cap is configurable, not assumed", () => {
  // Nkọwa okwu document 2,500/day but some keys report lower. The runner must
  // pace against the real limit rather than a number baked into code.
  const parsed = translationIntegrationPayloadSchema.parse({
    title: "t",
    providerByLanguage: {},
    igboApi: { apiKey: "k", baseUrl: "https://igboapi.com", dailyRequestLimit: 500 }
  });
  assert.equal(parsed.igboApi.dailyRequestLimit, 500);
});

test("the daily cap defaults to the documented 2,500", () => {
  const parsed = translationIntegrationPayloadSchema.parse({
    title: "t",
    providerByLanguage: {}
  });
  assert.equal(parsed.igboApi.dailyRequestLimit, 2500);
});

test("a non-URL Igbo API base is rejected", () => {
  const result = translationIntegrationPayloadSchema.safeParse({
    title: "t",
    providerByLanguage: {},
    igboApi: { apiKey: "k", baseUrl: "not-a-url", dailyRequestLimit: 100 }
  });
  assert.equal(result.success, false);
});

test("the Igbo API is not offered for Pidgin", () => {
  // eng<->ibo only. Allowing it for pcm would be a misconfiguration that
  // produces nothing at run time rather than failing loudly at save time.
  const forPidgin = providersSupporting("pcm");
  assert.ok(!forPidgin.includes("igbo_api"));
  assert.ok(forPidgin.includes("gemini"));
  assert.ok(forPidgin.includes("anthropic"));
});

test("all three providers are offered for Igbo", () => {
  const forIgbo = providersSupporting("ig");
  assert.deepEqual([...forIgbo].sort(), ["anthropic", "gemini", "igbo_api"]);
});

test("an unknown provider key is rejected", () => {
  const result = translationIntegrationPayloadSchema.safeParse({
    title: "t",
    providerByLanguage: { pcm: "deepl", ig: "gemini" }
  });
  assert.equal(result.success, false);
});

test("notes are length-capped like the other integration payloads", () => {
  const result = translationIntegrationPayloadSchema.safeParse({
    title: "t",
    providerByLanguage: {},
    notes: "x".repeat(1001)
  });
  assert.equal(result.success, false);
});
