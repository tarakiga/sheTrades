import test from "node:test";
import assert from "node:assert/strict";
import { integrationConfigPayloadSchema } from "./contracts.js";

test("a translation payload is accepted by the integration union", () => {
  const parsed = integrationConfigPayloadSchema.parse({
    title: "Primary Translation Integration",
    kind: "translation",
    enabled: true,
    providerByLanguage: { pcm: "gemini", ig: "igbo_api" },
    igboApi: { apiKey: "k", baseUrl: "https://igboapi.com", dailyRequestLimit: 2500 },
    gemini: { apiKey: "g", model: "gemini-2.5-flash" },
    anthropic: { apiKey: "", model: "claude-sonnet-5" }
  });
  assert.equal((parsed as { kind?: string }).kind, "translation");
});

test("an SMTP payload still routes to the notification member, not translation", () => {
  const parsed = integrationConfigPayloadSchema.parse({
    title: "SMTP", provider: "smtp", enabled: true, host: "h", port: 587, secure: false,
    username: "u", password: "p", fromName: "n", fromEmail: "f@x.com"
  });
  assert.equal((parsed as { provider?: string }).provider, "smtp");
});
